import Dexie from "../../vendor/dexie.mjs";
import { APP_CONFIG } from "../config.js";

export const OFFLINE_DATABASE_NAME = 'kyrgyz-organics-offline-v1';
export const OFFLINE_DATABASE_SCHEMA_VERSION = 2;
export const SYNC_LEASE_ID = 'invoice-sync';
export const SYNC_LEASE_TTL_MS = 45000;

var offlineDatabase = null;

function createDatabase() {
    var database = new Dexie(OFFLINE_DATABASE_NAME);

    database.version(1).stores({
        queue: 'id,status,createdAtLocal,entityId',
        metadata: 'key',
        conflicts: 'id,entityId,status'
    });

    database.version(2).stores({
        queue: 'id,status,createdAtLocal,entityId',
        metadata: 'key',
        conflicts: 'id,entityId,status',
        offlineIntents: 'intentId,status,actorId,aggregateType,aggregateId,sequenceNumber,nextAttemptAt,createdAt,updatedAt',
        invoiceProjections: 'invoiceId,canonicalInvoiceId,syncState,actorId,updatedAt',
        syncMetadata: 'key',
        syncLocks: 'lockId,expiresAt,ownerId'
    }).upgrade(function(transaction) {
        return transaction.table('syncMetadata').put({
            key: 'schema',
            databaseName: OFFLINE_DATABASE_NAME,
            schemaVersion: OFFLINE_DATABASE_SCHEMA_VERSION,
            appVersion: APP_CONFIG.VERSION,
            upgradedAt: new Date().toISOString()
        });
    });

    return database;
}

export function getOfflineDatabase() {
    if (!offlineDatabase) {
        offlineDatabase = createDatabase();
    }
    return offlineDatabase;
}

export async function openOfflineDexieDatabase() {
    var database = getOfflineDatabase();
    await database.open();
    return database;
}

export async function requestPersistentStorage() {
    if (typeof navigator === 'undefined') {
        return false;
    }
    if (!navigator.storage || typeof navigator.storage.persist !== 'function') {
        return false;
    }

    try {
        return await navigator.storage.persist();
    } catch (error) {
        console.warn('Persistent storage request failed.', error);
        return false;
    }
}

export async function getNextSequenceNumber() {
    var database = await openOfflineDexieDatabase();
    return database.transaction('rw', database.syncMetadata, async function() {
        var record = await database.syncMetadata.get('sequenceCounter');
        var nextValue = Number(record && record.value ? record.value : 0) + 1;
        await database.syncMetadata.put({
            key: 'sequenceCounter',
            value: nextValue,
            updatedAt: new Date().toISOString()
        });
        return nextValue;
    });
}

export async function saveIntentAndProjection(intentRecord, invoiceProjection) {
    var database = await openOfflineDexieDatabase();
    return database.transaction('rw', database.offlineIntents, database.invoiceProjections, async function() {
        await database.offlineIntents.put(intentRecord);
        if (invoiceProjection) {
            await database.invoiceProjections.put(invoiceProjection);
        }
        return intentRecord;
    });
}

export async function updateSyncMetadata(key, value) {
    var database = await openOfflineDexieDatabase();
    var record = Object.assign({ key: key }, value || {}, {
        updatedAt: new Date().toISOString()
    });
    await database.syncMetadata.put(record);
    return record;
}

export async function getSyncMetadata(key) {
    var database = await openOfflineDexieDatabase();
    return database.syncMetadata.get(key);
}

export async function acquireSyncLease(ownerId, nowMillis) {
    var database = await openOfflineDexieDatabase();
    var currentMillis = Number(nowMillis) || Date.now();
    var expiresAt = new Date(currentMillis + SYNC_LEASE_TTL_MS).toISOString();

    return database.transaction('rw', database.syncLocks, async function() {
        var existing = await database.syncLocks.get(SYNC_LEASE_ID);
        if (existing && existing.expiresAt && new Date(existing.expiresAt).getTime() > currentMillis && existing.ownerId !== ownerId) {
            return false;
        }

        await database.syncLocks.put({
            lockId: SYNC_LEASE_ID,
            ownerId: ownerId,
            acquiredAt: new Date(currentMillis).toISOString(),
            expiresAt: expiresAt
        });
        return true;
    });
}

export async function releaseSyncLease(ownerId) {
    var database = await openOfflineDexieDatabase();
    var existing = await database.syncLocks.get(SYNC_LEASE_ID);
    if (!existing || existing.ownerId !== ownerId) {
        return false;
    }
    await database.syncLocks.delete(SYNC_LEASE_ID);
    return true;
}

export async function resetStaleSyncingIntents(nowMillis) {
    var database = await openOfflineDexieDatabase();
    var currentMillis = Number(nowMillis) || Date.now();
    var staleBefore = new Date(currentMillis - SYNC_LEASE_TTL_MS).toISOString();
    var syncingItems = await database.offlineIntents
        .where('status')
        .equals('syncing')
        .toArray();

    for (var index = 0; index < syncingItems.length; index += 1) {
        var item = syncingItems[index];
        if (!item.lastAttemptAt || item.lastAttemptAt < staleBefore) {
            item.status = 'pending';
            item.updatedAt = new Date().toISOString();
            await database.offlineIntents.put(item);
        }
    }
}

export async function cleanupAcknowledgedIntents(retentionDays) {
    var database = await openOfflineDexieDatabase();
    var safeDays = Math.max(1, Number(retentionDays) || 7);
    var cutoff = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000).toISOString();
    var acknowledged = await database.offlineIntents
        .where('status')
        .equals('acknowledged')
        .toArray();

    for (var index = 0; index < acknowledged.length; index += 1) {
        if (acknowledged[index].acknowledgedAt && acknowledged[index].acknowledgedAt < cutoff) {
            await database.offlineIntents.delete(acknowledged[index].intentId);
        }
    }
}

export function resetOfflineDatabaseForTests() {
    if (offlineDatabase) {
        offlineDatabase.close();
    }
    offlineDatabase = null;
}
