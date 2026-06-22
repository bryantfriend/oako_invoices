import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import fs from 'node:fs';

import {
    OFFLINE_DATABASE_NAME,
    acquireSyncLease,
    getNextSequenceNumber,
    getOfflineDatabase,
    releaseSyncLease,
    resetOfflineDatabaseForTests,
    resetStaleSyncingIntents,
    saveIntentAndProjection
} from '../js/services/offlineDexieDb.js';
import {
    classifySyncError,
    calculateRetryDelayMilliseconds,
    SYNC_RETRY_STATUSES
} from '../js/services/syncRetryPolicy.js';
import {
    isBackendOrAuthUrl,
    shouldBypassRuntimeCaching,
    shouldHandleNavigation
} from '../js/service-worker/cacheRules.js';

function deleteDatabase(name) {
    return new Promise(function(resolve, reject) {
        var request = indexedDB.deleteDatabase(name);
        request.onsuccess = function() {
            resolve();
        };
        request.onerror = function() {
            reject(request.error);
        };
        request.onblocked = function() {
            resolve();
        };
    });
}

async function resetDatabase() {
    resetOfflineDatabaseForTests();
    await deleteDatabase(OFFLINE_DATABASE_NAME);
    resetOfflineDatabaseForTests();
}

test('Dexie schema creates offline intent, projection, metadata, and lock stores', async function() {
    await resetDatabase();
    var database = getOfflineDatabase();
    await database.open();

    assert.ok(database.offlineIntents);
    assert.ok(database.invoiceProjections);
    assert.ok(database.syncMetadata);
    assert.ok(database.syncLocks);
    assert.ok(database.queue);

    database.close();
});

test('Dexie sequence counter preserves FIFO ordering', async function() {
    await resetDatabase();

    var first = await getNextSequenceNumber();
    var second = await getNextSequenceNumber();
    var third = await getNextSequenceNumber();

    assert.deepEqual([first, second, third], [1, 2, 3]);
});

test('Dexie saves intent and invoice projection atomically', async function() {
    await resetDatabase();
    var database = getOfflineDatabase();
    await database.open();

    var intent = {
        intentId: 'intent-atomic',
        status: 'pending',
        actorId: 'user-1',
        aggregateType: 'invoice',
        aggregateId: 'invoice-1',
        sequenceNumber: 1,
        createdAt: '2026-06-22T00:00:00.000Z',
        updatedAt: '2026-06-22T00:00:00.000Z'
    };
    var projection = {
        invoiceId: 'invoice-1',
        syncState: 'pending_sync',
        actorId: 'user-1',
        updatedAt: '2026-06-22T00:00:00.000Z',
        invoice: {
            id: 'invoice-1',
            totalAmount: 10
        }
    };

    await saveIntentAndProjection(intent, projection);

    assert.equal((await database.offlineIntents.get('intent-atomic')).aggregateId, 'invoice-1');
    assert.equal((await database.invoiceProjections.get('invoice-1')).invoice.totalAmount, 10);

    database.close();
});

test('Dexie sync lease prevents two tabs from processing the queue', async function() {
    await resetDatabase();

    var first = await acquireSyncLease('tab-a', Date.UTC(2026, 5, 22, 10, 0, 0));
    var second = await acquireSyncLease('tab-b', Date.UTC(2026, 5, 22, 10, 0, 1));
    var released = await releaseSyncLease('tab-a');
    var third = await acquireSyncLease('tab-b', Date.UTC(2026, 5, 22, 10, 0, 2));

    assert.equal(first, true);
    assert.equal(second, false);
    assert.equal(released, true);
    assert.equal(third, true);
});

test('Dexie stale syncing recovery returns crashed rows to pending', async function() {
    await resetDatabase();
    var database = getOfflineDatabase();
    await database.open();

    await database.offlineIntents.put({
        intentId: 'intent-stale',
        status: 'syncing',
        actorId: 'user-1',
        aggregateType: 'invoice',
        aggregateId: 'invoice-1',
        sequenceNumber: 1,
        lastAttemptAt: '2026-06-22T10:00:00.000Z',
        createdAt: '2026-06-22T10:00:00.000Z',
        updatedAt: '2026-06-22T10:00:00.000Z'
    });

    await resetStaleSyncingIntents(Date.UTC(2026, 5, 22, 10, 2, 0));

    assert.equal((await database.offlineIntents.get('intent-stale')).status, 'pending');
    database.close();
});

test('Retry policy classifies retryable, authentication, terminal, and conflict failures', function() {
    assert.equal(classifySyncError({ code: 'unavailable', message: 'try later' }).status, SYNC_RETRY_STATUSES.RETRY_WAIT);
    assert.equal(classifySyncError({ code: 'unauthenticated', message: 'missing auth' }).status, SYNC_RETRY_STATUSES.BLOCKED_AUTHENTICATION);
    assert.equal(classifySyncError({ code: 'permission-denied', message: 'no' }).status, SYNC_RETRY_STATUSES.FAILED_TERMINAL);
    assert.equal(classifySyncError(new Error('sync_conflict')).status, SYNC_RETRY_STATUSES.CONFLICT);
});

test('Retry backoff grows and remains bounded', function() {
    var first = calculateRetryDelayMilliseconds(1, 0);
    var third = calculateRetryDelayMilliseconds(3, 0);
    var large = calculateRetryDelayMilliseconds(50, 1);

    assert.equal(first, 1000);
    assert.equal(third, 4000);
    assert.equal(large, 300000);
});

test('Workbox route rules exclude dynamic backend and mutation requests', function() {
    assert.equal(isBackendOrAuthUrl('https://firestore.googleapis.com/google.firestore.v1.Firestore/Write/channel'), true);
    assert.equal(shouldBypassRuntimeCaching({ method: 'POST', url: 'https://example.com/invoices' }), true);
    assert.equal(shouldBypassRuntimeCaching({ method: 'GET', url: 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword' }), true);
    assert.equal(shouldHandleNavigation({ method: 'GET', mode: 'navigate', url: 'https://oako.local/index.html' }, new URL('https://oako.local/index.html')), true);
});

test('Workbox build output is generated and does not keep the injection marker', function() {
    var worker = fs.readFileSync('sw.js', 'utf8');
    assert.equal(worker.indexOf('__WB_MANIFEST'), -1);
    assert.notEqual(worker.indexOf('OAKO_SKIP_WAITING'), -1);
    assert.notEqual(worker.indexOf('offline.html'), -1);
});

test('Application update service uses user-controlled activation and cache-bypassed version checks', function() {
    var source = fs.readFileSync('js/services/appUpdateService.js', 'utf8');
    assert.notEqual(source.indexOf('messageSkipWaiting'), -1);
    assert.notEqual(source.indexOf("cache: 'no-store'"), -1);
    assert.equal(source.indexOf('skipWaiting()'), -1);
});

test('Synchronization UI is excluded from print output', function() {
    var css = fs.readFileSync('css/styles.css', 'utf8');
    assert.notEqual(css.indexOf('@media print'), -1);
    assert.notEqual(css.indexOf('.sync-status-badge'), -1);
    assert.notEqual(css.indexOf('.oako-update-banner'), -1);
});
