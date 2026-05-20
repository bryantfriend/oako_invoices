import { auth } from "../core/firebase.js";
import { deviceIdService } from "./deviceIdService.js";
import { getAllFromStore, getRecord, putRecord } from "./offlineDbService.js";

const ACTIVE_LOCAL_STATUSES = ['pending', 'syncing', 'failed'];
const subscribers = [];

function createQueueId() {
    const randomPart = Math.random().toString(36).slice(2, 10).toUpperCase();
    return 'queue-' + Date.now() + '-' + randomPart;
}

function cloneData(value) {
    return JSON.parse(JSON.stringify(value || {}));
}

function sortByCreatedAtLocal(a, b) {
    return String(a.createdAtLocal || '').localeCompare(String(b.createdAtLocal || ''));
}

function isActiveLocalStatus(status) {
    return ACTIVE_LOCAL_STATUSES.indexOf(status) !== -1;
}

function notifySubscribers() {
    for (let index = 0; index < subscribers.length; index += 1) {
        try {
            subscribers[index]();
        } catch (error) {
            console.warn('Offline queue subscriber failed.', error);
        }
    }
}

async function getAllQueueItems() {
    const items = await getAllFromStore('queue').catch(function(error) {
        console.warn('Could not read offline queue.', error);
        return [];
    });
    return items.sort(sortByCreatedAtLocal);
}

export const offlineQueueService = {
    async enqueue(actionType, entityType, entityId, payload, options) {
        const createdAtLocal = new Date().toISOString();
        const deviceId = await deviceIdService.getDeviceId();
        const user = auth.currentUser;
        const safeOptions = options || {};

        const item = {
            id: createQueueId(),
            actionType: actionType,
            entityType: entityType,
            entityId: entityId,
            payload: cloneData(payload),
            createdAtLocal: createdAtLocal,
            deviceId: deviceId,
            userId: user ? user.uid : '',
            storeId: safeOptions.storeId || safeOptions.companyId || payload.storeId || payload.companyId || 'KORG',
            companyId: safeOptions.companyId || payload.companyId || safeOptions.storeId || payload.storeId || 'KORG',
            status: 'pending',
            retryCount: 0,
            lastError: ''
        };

        await putRecord('queue', item);
        notifySubscribers();
        return item;
    },

    async getQueueItem(id) {
        return getRecord('queue', id);
    },

    async updateQueueItem(id, updates) {
        const existing = await this.getQueueItem(id);
        if (!existing) {
            return null;
        }

        const next = Object.assign({}, existing, updates || {});
        await putRecord('queue', next);
        notifySubscribers();
        return next;
    },

    async listProcessableItems() {
        const items = await getAllQueueItems();
        return items.filter(function(item) {
            return item.status === 'pending' || item.status === 'failed';
        });
    },

    async listActiveItems() {
        const items = await getAllQueueItems();
        return items.filter(function(item) {
            return isActiveLocalStatus(item.status);
        });
    },

    async markSyncing(id) {
        return this.updateQueueItem(id, {
            status: 'syncing',
            lastError: ''
        });
    },

    async markSynced(id) {
        return this.updateQueueItem(id, {
            status: 'synced',
            syncedAt: new Date().toISOString(),
            lastError: ''
        });
    },

    async markFailed(id, error) {
        const existing = await this.getQueueItem(id);
        if (!existing) {
            return null;
        }

        return this.updateQueueItem(id, {
            status: 'failed',
            retryCount: Number(existing.retryCount || 0) + 1,
            lastError: error && error.message ? error.message : String(error || 'Sync failed'),
            failedAt: new Date().toISOString()
        });
    },

    async getSummary() {
        const items = await getAllQueueItems();
        const summary = {
            pending: 0,
            syncing: 0,
            synced: 0,
            failed: 0,
            total: items.length
        };

        for (let index = 0; index < items.length; index += 1) {
            const status = items[index].status || 'pending';
            if (summary[status] !== undefined) {
                summary[status] += 1;
            }
        }

        return summary;
    },

    async getLocalInvoiceSnapshot(entityId) {
        const items = await this.listActiveItems();
        let snapshot = null;

        for (let index = 0; index < items.length; index += 1) {
            const item = items[index];
            if (item.entityType !== 'invoice' || item.entityId !== entityId) {
                continue;
            }
            if (item.payload && item.payload.localInvoiceSnapshot) {
                snapshot = cloneData(item.payload.localInvoiceSnapshot);
                if (item.status === 'failed' && snapshot.syncState !== 'sync_conflict') {
                    snapshot.syncState = 'sync_failed';
                }
                if (item.status === 'syncing') {
                    snapshot.syncState = 'pending_sync';
                }
            }
        }

        return snapshot;
    },

    async getLocalInvoiceSnapshots() {
        const items = await this.listActiveItems();
        const snapshots = {};

        for (let index = 0; index < items.length; index += 1) {
            const item = items[index];
            if (item.entityType !== 'invoice') {
                continue;
            }
            if (item.payload && item.payload.localInvoiceSnapshot) {
                snapshots[item.entityId] = cloneData(item.payload.localInvoiceSnapshot);
                if (item.status === 'failed' && snapshots[item.entityId].syncState !== 'sync_conflict') {
                    snapshots[item.entityId].syncState = 'sync_failed';
                }
                if (item.status === 'syncing') {
                    snapshots[item.entityId].syncState = 'pending_sync';
                }
            }
        }

        return snapshots;
    },

    subscribe(callback) {
        subscribers.push(callback);
        return function unsubscribe() {
            const index = subscribers.indexOf(callback);
            if (index !== -1) {
                subscribers.splice(index, 1);
            }
        };
    }
};
