import { getAllFromStore, getRecord, putRecord } from "./offlineDbService.js";

const subscribers = [];

function notifySubscribers() {
    for (let index = 0; index < subscribers.length; index += 1) {
        try {
            subscribers[index]();
        } catch (error) {
            console.warn('Conflict subscriber failed.', error);
        }
    }
}

function cloneData(value) {
    return JSON.parse(JSON.stringify(value || {}));
}

export const conflictService = {
    async saveConflict(queueItem, serverVersion, localVersion) {
        const conflict = {
            id: 'conflict-' + queueItem.id,
            queueItemId: queueItem.id,
            entityType: queueItem.entityType,
            entityId: queueItem.entityId,
            actionType: queueItem.actionType,
            serverVersion: cloneData(serverVersion),
            localVersion: cloneData(localVersion),
            status: 'open',
            createdAtLocal: new Date().toISOString(),
            lastError: 'The server invoice changed before this offline change synced.'
        };

        await putRecord('conflicts', conflict);
        notifySubscribers();
        return conflict;
    },

    async getConflict(id) {
        return getRecord('conflicts', id);
    },

    async getOpenConflicts() {
        const conflicts = await getAllFromStore('conflicts').catch(function() {
            return [];
        });
        return conflicts.filter(function(conflict) {
            return conflict.status === 'open';
        });
    },

    async getOpenConflictByEntityId(entityId) {
        const conflicts = await this.getOpenConflicts();
        for (let index = 0; index < conflicts.length; index += 1) {
            if (conflicts[index].entityId === entityId) {
                return conflicts[index];
            }
        }
        return null;
    },

    async resolveConflict(id, resolution) {
        const conflict = await this.getConflict(id);
        if (!conflict) {
            return null;
        }

        const next = Object.assign({}, conflict, {
            status: 'resolved',
            resolution: resolution,
            resolvedAtLocal: new Date().toISOString()
        });

        await putRecord('conflicts', next);
        notifySubscribers();
        return next;
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
