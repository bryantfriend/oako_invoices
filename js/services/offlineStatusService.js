import { offlinePersistenceState } from "../core/firebase.js";
import { offlineQueueService } from "./offlineQueueService.js";

const subscribers = [];

const state = {
    online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
    syncing: false,
    syncError: false,
    pendingCount: 0,
    failedCount: 0,
    warning: offlinePersistenceState.warning || ''
};

let initialized = false;

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
    const summary = await offlineQueueService.getSummary();
    state.pendingCount = summary.pending + summary.syncing;
    state.failedCount = summary.failed;
    if (state.failedCount === 0) {
        state.syncError = false;
    }
    notifySubscribers();
}

function setOnlineStatus(isOnline) {
    state.online = isOnline;
    notifySubscribers();
}

export const offlineStatusService = {
    init() {
        if (initialized) {
            return;
        }
        initialized = true;

        window.addEventListener('online', function() {
            setOnlineStatus(true);
            window.dispatchEvent(new CustomEvent('kyrgyz-organics-online'));
        });

        window.addEventListener('offline', function() {
            setOnlineStatus(false);
        });

        offlineQueueService.subscribe(function() {
            refreshQueueStatus();
        });

        refreshQueueStatus();
    },

    isOnline() {
        return state.online === true;
    },

    setSyncing(value) {
        state.syncing = value === true;
        if (value === true) {
            state.syncError = false;
        }
        notifySubscribers();
    },

    setSyncError(value) {
        state.syncError = value === true;
        notifySubscribers();
    },

    async refresh() {
        await refreshQueueStatus();
    },

    getSnapshot() {
        let label = 'Online';
        let tone = 'online';

        if (state.syncing) {
            label = 'Syncing';
            tone = 'syncing';
        } else if (state.syncError || state.failedCount > 0) {
            label = 'Sync Error';
            tone = 'error';
        } else if (!state.online) {
            label = 'Offline Mode';
            tone = 'offline';
        } else if (state.pendingCount > 0) {
            label = 'Pending Changes';
            tone = 'pending';
        }

        return {
            online: state.online,
            syncing: state.syncing,
            syncError: state.syncError,
            pendingCount: state.pendingCount,
            failedCount: state.failedCount,
            warning: state.warning,
            label: label,
            tone: tone
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
