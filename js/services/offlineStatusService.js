import * as firebaseCore from "../core/firebase.js";
import { offlineQueueService } from "./offlineQueueService.js";
import { connectionStateService } from "./connectionStateService.js";

const subscribers = [];
const offlinePersistenceState = firebaseCore.offlinePersistenceState || { warning: '' };

const state = {
    online: false,
    syncing: false,
    syncError: false,
    pendingCount: 0,
    failedCount: 0,
    conflictCount: 0,
    authenticationBlockedCount: 0,
    lastSuccessfulSyncAt: '',
    updateAvailable: false,
    warning: offlinePersistenceState.warning || '',
    connection: connectionStateService.getSnapshot()
};

let initialized = false;
let lastCloudReachable = false;

function notifySubscribers() {
    for (let index = 0; index < subscribers.length; index += 1) {
        try {
            subscribers[index](offlineStatusService.getSnapshot());
        } catch (error) {
            console.warn('Offline status subscriber failed.', error);
        }
    }
}

async function refreshQueueStatus() {
    try {
        await offlineQueueService.init();
        const summary = await offlineQueueService.getSummary();
        state.pendingCount = summary.pending + summary.syncing + summary.retry_wait;
        state.failedCount = summary.failed + summary.failed_terminal;
        state.conflictCount = summary.conflict;
        state.authenticationBlockedCount = summary.blocked_authentication;
        state.warning = offlinePersistenceState.warning || '';
        if (state.failedCount === 0) {
            state.syncError = false;
        }
    } catch (error) {
        // IndexedDB can be disabled or temporarily unavailable in some browsers.
        // Queue status is diagnostic data, so startup must continue without turning
        // this expected storage limitation into an unhandled promise rejection.
        state.warning = 'Offline storage is unavailable in this browser session.';
        console.warn('Could not refresh offline queue status.', error);
    }
    notifySubscribers();
}

function applyConnectionSnapshot(connection) {
    state.connection = connection || connectionStateService.getSnapshot();
    state.online = connectionStateService.isCloudReachable();
    if (state.online && !lastCloudReachable && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('kyrgyz-organics-online'));
    }
    lastCloudReachable = state.online;
    notifySubscribers();
}

export const offlineStatusService = {
    init() {
        if (initialized) {
            return;
        }
        initialized = true;

        connectionStateService.subscribe(function(connection) {
            applyConnectionSnapshot(connection);
        });
        connectionStateService.init();

        if (typeof window !== 'undefined') {
            window.addEventListener('online', function() {
                connectionStateService.refresh({ reason: 'browser-online-event', force: true });
            });

            window.addEventListener('offline', function() {
                applyConnectionSnapshot(connectionStateService.getSnapshot());
            });
        }

        offlineQueueService.subscribe(function() {
            refreshQueueStatus();
        });

        refreshQueueStatus();
    },

    isOnline() {
        return connectionStateService.isCloudReachable();
    },

    canAttemptCloudRead() {
        const connection = connectionStateService.getSnapshot();
        return connection.firestoreReachable === true || (!connection.checkedAt && connection.browserOnline !== false);
    },

    setSyncing(value) {
        state.syncing = value === true;
        connectionStateService.setSyncing(state.syncing);
        if (value === true) {
            state.syncError = false;
        }
        notifySubscribers();
    },

    setSyncError(value) {
        state.syncError = value === true;
        notifySubscribers();
    },

    setUpdateAvailable(value) {
        state.updateAvailable = value === true;
        notifySubscribers();
    },

    setLastSuccessfulSyncAt(value) {
        state.lastSuccessfulSyncAt = value || new Date().toISOString();
        notifySubscribers();
    },

    async refresh() {
        const connection = await connectionStateService.refresh({ reason: 'offline-status-refresh', force: true });
        applyConnectionSnapshot(connection);
        await refreshQueueStatus();
    },

    getSnapshot() {
        let label = 'Online';
        let tone = 'online';
        const connection = state.connection || {};

        if (state.syncing || connection.mode === 'syncing') {
            label = 'Syncing';
            tone = 'syncing';
        } else if (state.updateAvailable) {
            label = 'Update Available';
            tone = 'update';
        } else if (state.conflictCount > 0) {
            label = 'Conflict Requires Review';
            tone = 'error';
        } else if (state.authenticationBlockedCount > 0) {
            label = 'Authentication Required';
            tone = 'error';
        } else if (state.syncError || state.failedCount > 0) {
            label = 'Sync Error';
            tone = 'error';
        } else if (connection.mode === 'degraded') {
            label = 'Limited Connection';
            tone = 'limited';
        } else if (!state.online) {
            label = 'Offline Mode';
            tone = 'offline';
        } else if (state.pendingCount > 0) {
            label = 'Pending Sync';
            tone = 'pending';
        }

        return {
            online: state.online,
            syncing: state.syncing,
            syncError: state.syncError,
            pendingCount: state.pendingCount,
            failedCount: state.failedCount,
            conflictCount: state.conflictCount,
            authenticationBlockedCount: state.authenticationBlockedCount,
            lastSuccessfulSyncAt: state.lastSuccessfulSyncAt,
            updateAvailable: state.updateAvailable,
            warning: state.warning,
            label: label,
            tone: tone,
            connection: Object.assign({}, connection),
            browserOnline: connection.browserOnline === true,
            internetReachable: connection.internetReachable === true,
            firestoreReachable: connection.firestoreReachable === true,
            connectionMode: connection.mode || 'offline',
            connectionReason: connection.reason || ''
        };
    },

    subscribe(callback) {
        subscribers.push(callback);
        callback(this.getSnapshot());
        return function unsubscribe() {
            const index = subscribers.indexOf(callback);
            if (index !== -1) {
                subscribers.splice(index, 1);
            }
        };
    }
};


