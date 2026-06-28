import { db } from "../core/firebase.js";
import { doc, getDocFromServer } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { offlineQueueService } from "./offlineQueueService.js";

const HEALTH_TIMEOUT_MS = 4500;
const FIRESTORE_TIMEOUT_MS = 6500;
const REFRESH_INTERVAL_MS = 30000;

const subscribers = [];

const state = {
    browserOnline: typeof navigator === 'undefined' ? false : navigator.onLine !== false,
    internetReachable: false,
    firestoreReachable: false,
    lastSuccessfulHealthCheckAt: '',
    lastSuccessfulFirestoreReadAt: '',
    lastSuccessfulFirestoreWriteAt: '',
    pendingSyncCount: 0,
    mode: 'offline',
    reason: 'Connectivity has not been checked yet.',
    checkedAt: ''
};

let initialized = false;
let refreshPromise = null;
let refreshTimer = null;

function cloneState() {
    return Object.assign({}, state);
}

function notifySubscribers() {
    var snapshot = cloneState();
    for (var index = 0; index < subscribers.length; index += 1) {
        try {
            subscribers[index](snapshot);
        } catch (error) {
            console.warn('Connection state subscriber failed.', error);
        }
    }
}

function logConnectivity() {
    console.info('[CONNECTIVITY] browserOnline: ' + state.browserOnline);
    console.info('[CONNECTIVITY] internetReachable: ' + state.internetReachable);
    console.info('[CONNECTIVITY] firestoreReachable: ' + state.firestoreReachable);
    console.info('[CONNECTIVITY] mode: ' + state.mode);
    console.info('[CONNECTIVITY] pendingSyncCount: ' + state.pendingSyncCount);
    console.info('[CONNECTIVITY] reason: ' + state.reason);
}

function withTimeout(promise, timeoutMs, label) {
    var timeoutId;
    var timeoutPromise = new Promise(function(resolve, reject) {
        timeoutId = setTimeout(function() {
            reject(new Error(label + ' timed out after ' + timeoutMs + ' ms'));
        }, timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]).finally(function() {
        clearTimeout(timeoutId);
    });
}

function createHealthUrl() {
    var base = './health.json';
    if (typeof window !== 'undefined' && window.location) {
        base = new URL('health.json', window.location.href).toString();
    }
    return base + (base.indexOf('?') === -1 ? '?' : '&') + 'ts=' + Date.now();
}

async function runHealthCheck() {
    if (typeof fetch !== 'function') {
        return { ok: false, reason: 'Fetch is unavailable.' };
    }

    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timeoutId = controller ? setTimeout(function() { controller.abort(); }, HEALTH_TIMEOUT_MS) : null;

    try {
        var response = await withTimeout(fetch(createHealthUrl(), {
            cache: 'no-store',
            credentials: 'same-origin',
            signal: controller ? controller.signal : undefined
        }), HEALTH_TIMEOUT_MS, 'Health check');
        return { ok: response && response.ok === true, reason: response && response.ok === true ? '' : 'Health check returned HTTP ' + (response ? response.status : 'unknown') + '.' };
    } catch (error) {
        return { ok: false, reason: error && error.message ? error.message : 'Health check failed.' };
    } finally {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
    }
}

async function runFirestoreCheck() {
    try {
        await withTimeout(getDocFromServer(doc(db, 'settings', 'offline_health')), FIRESTORE_TIMEOUT_MS, 'Firestore reachability check');
        return { ok: true, reason: '' };
    } catch (error) {
        return { ok: false, reason: error && error.message ? error.message : 'Firestore reachability check failed.' };
    }
}

async function getPendingSyncCount() {
    try {
        await offlineQueueService.init();
        var summary = await offlineQueueService.getSummary();
        return Number(summary.pending || 0) + Number(summary.syncing || 0) + Number(summary.retry_wait || 0) + Number(summary.conflict || 0) + Number(summary.blocked_authentication || 0);
    } catch (error) {
        return state.pendingSyncCount || 0;
    }
}

function computeMode(syncing, browserOnline, internetReachable, firestoreReachable, pendingSyncCount) {
    if (syncing === true) {
        return { mode: 'syncing', reason: 'Local changes are being sent to the cloud.' };
    }
    if (!browserOnline) {
        return { mode: 'offline', reason: 'The browser reports no network connection.' };
    }
    if (firestoreReachable) {
        if (pendingSyncCount > 0) {
            return { mode: 'online', reason: 'Firestore is reachable and local changes are pending sync.' };
        }
        if (!internetReachable) {
            return { mode: 'online', reason: 'Firestore is reachable. The static health check did not respond, so diagnostics may be limited.' };
        }
        return { mode: 'online', reason: 'Cloud services are reachable.' };
    }
    if (!internetReachable) {
        return { mode: 'degraded', reason: 'The browser reports online, but cloud reachability checks failed.' };
    }
    return { mode: 'degraded', reason: 'The app can reach the network, but Firestore is unavailable.' };
}

export const connectionStateService = {
    init: function() {
        if (initialized) {
            return;
        }
        initialized = true;

        if (typeof window !== 'undefined') {
            window.addEventListener('online', function() {
                connectionStateService.refresh({ reason: 'browser-online-event' });
            });
            window.addEventListener('offline', function() {
                state.browserOnline = false;
                state.internetReachable = false;
                state.firestoreReachable = false;
                state.mode = 'offline';
                state.reason = 'The browser reports no network connection.';
                state.checkedAt = new Date().toISOString();
                logConnectivity();
                notifySubscribers();
            });
        }

        offlineQueueService.subscribe(function() {
            connectionStateService.refresh({ reason: 'queue-changed', skipNetworkCheck: true });
        });

        this.refresh({ reason: 'startup' });
        refreshTimer = setInterval(function() {
            connectionStateService.refresh({ reason: 'interval' });
        }, REFRESH_INTERVAL_MS);
    },

    async refresh(options) {
        var safeOptions = options || {};
        if (refreshPromise && safeOptions.force !== true) {
            return refreshPromise;
        }

        refreshPromise = (async function() {
            var browserOnline = typeof navigator === 'undefined' ? false : navigator.onLine !== false;
            var pendingSyncCount = await getPendingSyncCount();
            var healthResult = { ok: false, reason: 'Skipped network check.' };
            var firestoreResult = { ok: false, reason: 'Skipped Firestore check.' };

            if (browserOnline && safeOptions.skipNetworkCheck !== true) {
                healthResult = await runHealthCheck();
                if (healthResult.ok) {
                    state.lastSuccessfulHealthCheckAt = new Date().toISOString();
                }
                firestoreResult = await runFirestoreCheck();
                if (firestoreResult.ok) {
                    state.lastSuccessfulFirestoreReadAt = new Date().toISOString();
                }
            } else if (browserOnline && safeOptions.skipNetworkCheck === true) {
                healthResult = { ok: state.internetReachable === true, reason: state.reason || '' };
                firestoreResult = { ok: state.firestoreReachable === true, reason: state.reason || '' };
            }

            var modeResult = computeMode(safeOptions.syncing === true, browserOnline, healthResult.ok, firestoreResult.ok, pendingSyncCount);
            state.browserOnline = browserOnline;
            state.internetReachable = healthResult.ok === true;
            state.firestoreReachable = firestoreResult.ok === true;
            state.pendingSyncCount = pendingSyncCount;
            state.mode = modeResult.mode;
            state.reason = modeResult.reason || healthResult.reason || firestoreResult.reason || '';
            if (state.mode === 'degraded' && healthResult.ok !== true && healthResult.reason) {
                state.reason = healthResult.reason;
            }
            if (state.mode === 'degraded' && healthResult.ok === true && firestoreResult.ok !== true && firestoreResult.reason) {
                state.reason = firestoreResult.reason;
            }
            if (state.mode === 'online' && firestoreResult.ok === true && healthResult.ok !== true && healthResult.reason) {
                state.reason = 'Firestore is reachable. Static health check failed: ' + healthResult.reason;
            }
            state.checkedAt = new Date().toISOString();

            logConnectivity();
            notifySubscribers();
            return cloneState();
        }()).finally(function() {
            refreshPromise = null;
        });

        return refreshPromise;
    },

    setSyncing: function(value) {
        if (value === true) {
            state.mode = 'syncing';
            state.reason = 'Local changes are being sent to the cloud.';
            notifySubscribers();
            logConnectivity();
            return;
        }
        this.refresh({ reason: 'sync-finished', force: true });
    },

    markSuccessfulFirestoreWrite: function() {
        state.lastSuccessfulFirestoreWriteAt = new Date().toISOString();
        notifySubscribers();
    },

    isCloudReachable: function() {
        return state.mode === 'online' && state.firestoreReachable === true;
    },

    getSnapshot: function() {
        return cloneState();
    },

    subscribe: function(callback) {
        subscribers.push(callback);
        callback(cloneState());
        return function unsubscribe() {
            var index = subscribers.indexOf(callback);
            if (index !== -1) {
                subscribers.splice(index, 1);
            }
        };
    },

    stopForTests: function() {
        if (refreshTimer) {
            clearInterval(refreshTimer);
            refreshTimer = null;
        }
    }
};
