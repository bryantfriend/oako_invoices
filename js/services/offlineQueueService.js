import { auth } from "../core/firebase.js";
import { APP_CONFIG } from "../config.js";
import { deviceIdService } from "./deviceIdService.js";
import {
    acquireSyncLease,
    getNextSequenceNumber,
    openOfflineDexieDatabase,
    releaseSyncLease,
    requestPersistentStorage,
    resetStaleSyncingIntents,
    saveIntentAndProjection,
    updateSyncMetadata
} from "./offlineDexieDb.js";
import {
    SYNC_RETRY_STATUSES,
    classifySyncError,
    getNextRetryIsoString
} from "./syncRetryPolicy.js";

const ACTIVE_LOCAL_STATUSES = [
    SYNC_RETRY_STATUSES.PENDING,
    SYNC_RETRY_STATUSES.SYNCING,
    SYNC_RETRY_STATUSES.RETRY_WAIT,
    SYNC_RETRY_STATUSES.BLOCKED_AUTHENTICATION,
    SYNC_RETRY_STATUSES.CONFLICT,
    SYNC_RETRY_STATUSES.FAILED_TERMINAL
];

const subscribers = [];
let legacyMigrationPromise = null;

function cloneData(value) {
    return JSON.parse(JSON.stringify(value || {}));
}

function getIsoNow() {
    return new Date().toISOString();
}

function createRandomHex(bytesLength) {
    var bytes = new Uint8Array(bytesLength);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        crypto.getRandomValues(bytes);
    } else {
        for (var index = 0; index < bytesLength; index += 1) {
            bytes[index] = Math.floor(Math.random() * 256);
        }
    }

    var output = '';
    for (var byteIndex = 0; byteIndex < bytes.length; byteIndex += 1) {
        output += bytes[byteIndex].toString(16).padStart(2, '0');
    }
    return output;
}

function createIntentId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return 'intent-' + crypto.randomUUID();
    }
    return 'intent-' + Date.now() + '-' + createRandomHex(16);
}

function getCurrentActorId() {
    var user = auth.currentUser;
    if (!user) {
        return '';
    }
    return user.uid || user.email || '';
}

function sortBySequenceNumber(a, b) {
    var sequenceA = Number(a.sequenceNumber || 0);
    var sequenceB = Number(b.sequenceNumber || 0);
    if (sequenceA !== sequenceB) {
        return sequenceA - sequenceB;
    }
    return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
}

function isActiveLocalStatus(status) {
    return ACTIVE_LOCAL_STATUSES.indexOf(status) !== -1;
}

function notifySubscribers() {
    for (var index = 0; index < subscribers.length; index += 1) {
        try {
            subscribers[index]();
        } catch (error) {
            console.warn('Offline queue subscriber failed.', error);
        }
    }
}

function mapLegacyStatus(status, lastError) {
    if (status === 'synced') {
        return SYNC_RETRY_STATUSES.ACKNOWLEDGED;
    }
    if (status === 'syncing') {
        return SYNC_RETRY_STATUSES.PENDING;
    }
    if (String(lastError || '').indexOf('sync_conflict') !== -1) {
        return SYNC_RETRY_STATUSES.CONFLICT;
    }
    if (status === 'failed') {
        return SYNC_RETRY_STATUSES.RETRY_WAIT;
    }
    return SYNC_RETRY_STATUSES.PENDING;
}

function buildIntentRecord(args) {
    var payload = cloneData(args.payload);
    var invoiceSnapshot = payload.localInvoiceSnapshot || payload.invoice || null;
    var now = getIsoNow();

    return {
        intentId: args.intentId,
        id: args.intentId,
        intentType: args.actionType,
        actionType: args.actionType,
        aggregateType: args.entityType,
        entityType: args.entityType,
        aggregateId: args.entityId,
        entityId: args.entityId,
        actorId: args.actorId || '',
        userId: args.actorId || '',
        locationId: args.storeId || args.companyId || '',
        storeId: args.storeId || args.companyId || 'KORG',
        companyId: args.companyId || args.storeId || 'KORG',
        sequenceNumber: args.sequenceNumber,
        baseRevision: payload.baseRevision || payload.baseUpdatedAtMillis || 0,
        payload: payload,
        schemaVersion: APP_CONFIG.DEXIE_SCHEMA_VERSION,
        appVersion: APP_CONFIG.VERSION,
        status: args.status || SYNC_RETRY_STATUSES.PENDING,
        attemptCount: Number(args.attemptCount || 0),
        retryCount: Number(args.attemptCount || 0),
        nextAttemptAt: args.nextAttemptAt || now,
        createdAt: args.createdAt || now,
        createdAtLocal: args.createdAt || now,
        updatedAt: now,
        lastAttemptAt: args.lastAttemptAt || '',
        acknowledgedAt: args.acknowledgedAt || '',
        lastErrorCode: args.lastErrorCode || '',
        lastErrorMessage: args.lastErrorMessage || '',
        lastError: args.lastErrorMessage || '',
        serverResult: args.serverResult || null,
        temporaryAggregateId: invoiceSnapshot && invoiceSnapshot.offlineCreated ? args.entityId : '',
        canonicalAggregateId: args.canonicalAggregateId || '',
        deviceId: args.deviceId || ''
    };
}

function buildInvoiceProjection(intentRecord) {
    var payload = intentRecord.payload || {};
    var invoice = payload.localInvoiceSnapshot || payload.invoice;
    if (!invoice || intentRecord.aggregateType !== 'invoice') {
        return null;
    }

    return {
        invoiceId: intentRecord.aggregateId,
        canonicalInvoiceId: intentRecord.canonicalAggregateId || intentRecord.aggregateId,
        actorId: intentRecord.actorId || '',
        serverRevision: intentRecord.baseRevision || 0,
        localRevision: intentRecord.sequenceNumber || 0,
        syncState: invoice.syncState || 'pending_sync',
        updatedAt: intentRecord.updatedAt,
        hasUnacknowledgedChanges: intentRecord.status !== SYNC_RETRY_STATUSES.ACKNOWLEDGED,
        invoice: cloneData(invoice)
    };
}


function getLocalEntitySnapshotFromIntent(intentRecord, entityType) {
    if (!intentRecord || (intentRecord.aggregateType !== entityType && intentRecord.entityType !== entityType)) {
        return null;
    }
    var payload = intentRecord.payload || {};
    if (entityType === 'invoice') {
        return payload.localInvoiceSnapshot || payload.invoice || null;
    }
    if (entityType === 'order') {
        return payload.localOrderSnapshot || payload.order || null;
    }
    return null;
}
function mapIntentForCompatibility(record) {
    if (!record) {
        return null;
    }
    return Object.assign({}, record, {
        id: record.intentId || record.id,
        actionType: record.actionType || record.intentType,
        entityType: record.entityType || record.aggregateType,
        entityId: record.entityId || record.aggregateId,
        userId: record.userId || record.actorId || '',
        retryCount: Number(record.retryCount || record.attemptCount || 0),
        lastError: record.lastError || record.lastErrorMessage || '',
        createdAtLocal: record.createdAtLocal || record.createdAt || ''
    });
}

async function migrateLegacyQueueIfNeeded() {
    if (legacyMigrationPromise) {
        return legacyMigrationPromise;
    }

    legacyMigrationPromise = (async function() {
        var database = await openOfflineDexieDatabase();
        var legacyRows = await database.queue.toArray().catch(function() {
            return [];
        });

        for (var index = 0; index < legacyRows.length; index += 1) {
            var row = legacyRows[index];
            if (!row || row.migratedToDexieIntent === true) {
                continue;
            }

            var existing = await database.offlineIntents.get(row.id);
            if (!existing) {
                var sequenceNumber = await getNextSequenceNumber();
                var migratedIntent = buildIntentRecord({
                    intentId: row.id,
                    actionType: row.actionType,
                    entityType: row.entityType,
                    entityId: row.entityId,
                    actorId: row.userId || '',
                    storeId: row.storeId || '',
                    companyId: row.companyId || '',
                    sequenceNumber: sequenceNumber,
                    payload: row.payload || {},
                    status: mapLegacyStatus(row.status, row.lastError),
                    attemptCount: row.retryCount || 0,
                    createdAt: row.createdAtLocal || getIsoNow(),
                    lastErrorMessage: row.lastError || '',
                    deviceId: row.deviceId || ''
                });
                await saveIntentAndProjection(migratedIntent, buildInvoiceProjection(migratedIntent));
            }

            row.migratedToDexieIntent = true;
            row.status = 'migrated_to_dexie';
            row.migratedAt = getIsoNow();
            await database.queue.put(row);
        }
    }());

    return legacyMigrationPromise;
}

async function getAllIntentRecords() {
    await migrateLegacyQueueIfNeeded();
    var database = await openOfflineDexieDatabase();
    var items = await database.offlineIntents.toArray().catch(function(error) {
        console.warn('Could not read offline intents.', error);
        return [];
    });
    return items.map(mapIntentForCompatibility).sort(sortBySequenceNumber);
}

export const offlineQueueService = {
    async init() {
        await openOfflineDexieDatabase();
        await requestPersistentStorage();
        await migrateLegacyQueueIfNeeded();
        await resetStaleSyncingIntents();
        await updateSyncMetadata('schema', {
            databaseName: 'kyrgyz-organics-offline-v1',
            schemaVersion: APP_CONFIG.DEXIE_SCHEMA_VERSION,
            appVersion: APP_CONFIG.VERSION
        });
    },

    async enqueue(actionType, entityType, entityId, payload, options) {
        var createdAtLocal = getIsoNow();
        var deviceId = await deviceIdService.getDeviceId();
        var safeOptions = options || {};
        var actorId = getCurrentActorId();
        var sequenceNumber = await getNextSequenceNumber();
        var intentRecord = buildIntentRecord({
            intentId: safeOptions.intentId || createIntentId(),
            actionType: actionType,
            entityType: entityType,
            entityId: entityId,
            actorId: actorId,
            storeId: safeOptions.storeId || safeOptions.companyId || payload.storeId || payload.companyId || 'KORG',
            companyId: safeOptions.companyId || payload.companyId || safeOptions.storeId || payload.storeId || 'KORG',
            sequenceNumber: sequenceNumber,
            payload: payload,
            createdAt: createdAtLocal,
            deviceId: deviceId
        });

        await saveIntentAndProjection(intentRecord, buildInvoiceProjection(intentRecord));
        notifySubscribers();
        return mapIntentForCompatibility(intentRecord);
    },

    async getQueueItem(id) {
        await migrateLegacyQueueIfNeeded();
        var database = await openOfflineDexieDatabase();
        return mapIntentForCompatibility(await database.offlineIntents.get(id));
    },

    async updateQueueItem(id, updates) {
        var existing = await this.getQueueItem(id);
        if (!existing) {
            return null;
        }

        var database = await openOfflineDexieDatabase();
        var next = Object.assign({}, existing, updates || {}, {
            intentId: existing.intentId || existing.id,
            updatedAt: getIsoNow()
        });
        if (next.payload && next.aggregateType === 'invoice' || next.payload && next.entityType === 'invoice') {
            await saveIntentAndProjection(next, buildInvoiceProjection(next));
        } else {
            await database.offlineIntents.put(next);
        }
        notifySubscribers();
        return mapIntentForCompatibility(next);
    },

    async listProcessableItems(actorId, options) {
        var items = await getAllIntentRecords();
        var now = getIsoNow();
        var safeActorId = actorId || getCurrentActorId();
        var safeOptions = options || {};

        return items.filter(function(item) {
            var status = item.status || SYNC_RETRY_STATUSES.PENDING;
            var statusIsProcessable = status === SYNC_RETRY_STATUSES.PENDING || status === SYNC_RETRY_STATUSES.RETRY_WAIT;
            var retryReady = safeOptions.includeRetryWait === true || !item.nextAttemptAt || item.nextAttemptAt <= now;
            var actorMatches = !item.userId || item.userId === safeActorId;
            return statusIsProcessable && retryReady && actorMatches;
        });
    },

    async listActiveItems() {
        var items = await getAllIntentRecords();
        return items.filter(function(item) {
            return isActiveLocalStatus(item.status);
        });
    },

    async markSyncing(id) {
        return this.updateQueueItem(id, {
            status: SYNC_RETRY_STATUSES.SYNCING,
            lastAttemptAt: getIsoNow(),
            lastError: '',
            lastErrorCode: '',
            lastErrorMessage: ''
        });
    },

    async markSynced(id, serverResult) {
        return this.updateQueueItem(id, {
            status: SYNC_RETRY_STATUSES.ACKNOWLEDGED,
            acknowledgedAt: getIsoNow(),
            syncedAt: getIsoNow(),
            serverResult: serverResult || null,
            lastError: '',
            lastErrorCode: '',
            lastErrorMessage: ''
        });
    },

    async markFailed(id, error) {
        var existing = await this.getQueueItem(id);
        if (!existing) {
            return null;
        }

        var nextAttemptCount = Number(existing.attemptCount || existing.retryCount || 0) + 1;
        var classification = classifySyncError(error);
        var nextAttemptAt = classification.retryable
            ? getNextRetryIsoString(nextAttemptCount)
            : existing.nextAttemptAt || getIsoNow();
        var failedPayload = existing.payload || null;

        if (failedPayload && (existing.entityType === 'order' || existing.aggregateType === 'order')) {
            var failedOrder = Object.assign({}, failedPayload.localOrderSnapshot || failedPayload.order || {}, {
                syncState: 'sync_failed',
                syncStatus: 'failed',
                syncErrorCode: classification.code,
                syncErrorMessage: classification.message,
                lastSyncAttemptAt: Date.now(),
                attemptCount: nextAttemptCount
            });
            failedPayload = Object.assign({}, failedPayload, {
                localOrderSnapshot: failedOrder,
                order: failedOrder
            });
        }

        return this.updateQueueItem(id, {
            status: classification.status,
            attemptCount: nextAttemptCount,
            retryCount: nextAttemptCount,
            nextAttemptAt: nextAttemptAt,
            lastAttemptAt: getIsoNow(),
            lastError: classification.message,
            lastErrorCode: classification.code,
            lastErrorMessage: classification.message,
            failedAt: getIsoNow(),
            payload: failedPayload || existing.payload
        });
    },

    async markBlockedForAuthentication(id) {
        return this.updateQueueItem(id, {
            status: SYNC_RETRY_STATUSES.BLOCKED_AUTHENTICATION,
            updatedAt: getIsoNow()
        });
    },

    async getSummary() {
        var items = await getAllIntentRecords();
        var summary = {
            pending: 0,
            syncing: 0,
            synced: 0,
            failed: 0,
            retry_wait: 0,
            blocked_authentication: 0,
            conflict: 0,
            failed_terminal: 0,
            acknowledged: 0,
            total: items.length
        };

        for (var index = 0; index < items.length; index += 1) {
            var status = items[index].status || SYNC_RETRY_STATUSES.PENDING;
            if (status === SYNC_RETRY_STATUSES.ACKNOWLEDGED) {
                summary.synced += 1;
            }
            if (summary[status] !== undefined) {
                summary[status] += 1;
            }
            if (status === SYNC_RETRY_STATUSES.FAILED_TERMINAL) {
                summary.failed += 1;
            }
        }

        return summary;
    },

    async getLocalInvoiceSnapshot(entityId) {
        try {
            var database = await openOfflineDexieDatabase();
            var projection = await database.invoiceProjections.get(entityId);
            if (!projection || !projection.invoice) {
                return null;
            }
            return cloneData(projection.invoice);
        } catch (error) {
            console.warn('Could not read local invoice snapshot; continuing without offline data.', error);
            return null;
        }
    },

    async getLocalInvoiceSnapshots() {
        var projections = [];
        try {
            var database = await openOfflineDexieDatabase();
            projections = await database.invoiceProjections.toArray();
        } catch (error) {
            console.warn('Could not read local invoice snapshots; continuing without offline data.', error);
            return {};
        }
        var snapshots = {};

        for (var index = 0; index < projections.length; index += 1) {
            var projection = projections[index];
            if (projection && projection.invoiceId && projection.invoice) {
                snapshots[projection.invoiceId] = cloneData(projection.invoice);
            }
        }

        return snapshots;
    },


    async getLocalEntitySnapshots(entityType) {
        var items = await getAllIntentRecords();
        var snapshots = {};
        for (var index = 0; index < items.length; index += 1) {
            var item = items[index];
            if (!isActiveLocalStatus(item.status)) {
                continue;
            }
            var snapshot = getLocalEntitySnapshotFromIntent(item, entityType);
            if (snapshot && item.entityId) {
                snapshots[item.entityId] = cloneData(snapshot);
            }
        }
        return snapshots;
    },
    async findActiveItemForEntity(entityType, entityId, actionType) {
        var items = await getAllIntentRecords();
        for (var index = 0; index < items.length; index += 1) {
            var item = items[index];
            if (!isActiveLocalStatus(item.status)) {
                continue;
            }
            if ((item.entityType || item.aggregateType) !== entityType) {
                continue;
            }
            if ((item.entityId || item.aggregateId) !== entityId) {
                continue;
            }
            if (actionType && (item.actionType || item.intentType) !== actionType) {
                continue;
            }
            return item;
        }
        return null;
    },

    async compactPendingOrderCreate(entityId, patch) {
        var queueItem = await this.findActiveItemForEntity('order', entityId, 'createOrder');
        if (!queueItem) {
            return null;
        }
        var payload = Object.assign({}, queueItem.payload || {});
        var existingOrder = Object.assign({}, payload.localOrderSnapshot || payload.order || {}, { id: entityId });
        var nextOrder = Object.assign({}, existingOrder, patch || {}, {
            id: entityId,
            localId: existingOrder.localId || entityId,
            serverId: existingOrder.serverId || null,
            syncStatus: 'pending',
            syncAction: 'create',
            syncState: existingOrder.syncState || 'offline_created',
            localUpdatedAt: new Date().toISOString(),
            localUpdatedAtMillis: Date.now()
        });
        payload.order = nextOrder;
        payload.localOrderSnapshot = nextOrder;
        payload.localUpdatedAt = nextOrder.localUpdatedAt;
        await this.updateQueueItem(queueItem.id, {
            status: SYNC_RETRY_STATUSES.PENDING,
            nextAttemptAt: new Date().toISOString(),
            lastError: '',
            lastErrorCode: '',
            lastErrorMessage: '',
            payload: payload
        });
        return nextOrder;
    },

    async removePendingOrderCreate(entityId) {
        var queueItem = await this.findActiveItemForEntity('order', entityId, 'createOrder');
        if (!queueItem) {
            return false;
        }
        var database = await openOfflineDexieDatabase();
        await database.offlineIntents.delete(queueItem.id);
        notifySubscribers();
        return true;
    },

    async acquireSyncLease(ownerId) {
        return acquireSyncLease(ownerId || 'tab-' + createRandomHex(8));
    },

    async releaseSyncLease(ownerId) {
        return releaseSyncLease(ownerId);
    },

    async recoverStaleSyncingItems() {
        await resetStaleSyncingIntents();
        notifySubscribers();
    },

    async getDiagnostics() {
        var database = await openOfflineDexieDatabase();
        var summary = await this.getSummary();
        var items = await getAllIntentRecords();
        var metadataRows = await database.syncMetadata.toArray().catch(function() {
            return [];
        });
        var lockRows = await database.syncLocks.toArray().catch(function() {
            return [];
        });
        return {
            appVersion: APP_CONFIG.VERSION,
            dexieSchemaVersion: APP_CONFIG.DEXIE_SCHEMA_VERSION,
            online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
            summary: summary,
            items: items.map(function(item) {
                return {
                    id: item.id || item.intentId || '',
                    actionType: item.actionType || item.intentType || '',
                    entityType: item.entityType || item.aggregateType || '',
                    entityId: item.entityId || item.aggregateId || '',
                    status: item.status || '',
                    attemptCount: item.attemptCount || item.retryCount || 0,
                    nextAttemptAt: item.nextAttemptAt || '',
                    lastErrorCode: item.lastErrorCode || '',
                    lastErrorMessage: item.lastErrorMessage || item.lastError || '',
                    updatedAt: item.updatedAt || '',
                    createdAt: item.createdAt || ''
                };
            }),
            metadata: metadataRows,
            locks: lockRows
        };
    },

    subscribe(callback) {
        subscribers.push(callback);
        return function unsubscribe() {
            var index = subscribers.indexOf(callback);
            if (index !== -1) {
                subscribers.splice(index, 1);
            }
        };
    }
};
