import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import 'fake-indexeddb/auto';
import { loadModule } from './helpers/load-isolated-module.mjs';
import { classifySyncError } from '../js/services/syncRetryPolicy.js';
import { getOfflineDatabase, acquireSyncLease, renewSyncLease, releaseSyncLease, resetStaleSyncingIntents } from '../js/services/offlineDexieDb.js';
import pipeline from '../js/ICF/engine/pipeline.js';

const database = getOfflineDatabase();
const quietConsole = { info: function() {}, warn: function() {}, error: function() {} };

test('transient transport and namespaced auth errors retain the right recovery category', function() {
    for (var error of [{ name: 'AbortError' }, { code: 'auth/network-request-failed' }, { message: 'Failed to fetch' }, { message: 'Load failed' }, { code: 'firestore/unavailable' }]) {
        assert.equal(classifySyncError(error).status, 'retry_wait');
    }
    assert.equal(classifySyncError({ code: 'firestore/unauthenticated' }).status, 'blocked_authentication');
    assert.equal(classifySyncError({ code: 'auth/user-token-expired' }).status, 'blocked_authentication');
    assert.equal(classifySyncError({ code: 'permission-denied', message: 'network' }).status, 'failed_terminal');
    assert.equal(classifySyncError(new Error('unknown failure')).status, 'failed_terminal');
});

test('renewed leases protect a slow worker, and stale recovery respects another owner', async function() {
    await database.open();
    await database.syncLocks.clear();
    await database.offlineIntents.clear();
    var now = Date.now();
    await database.offlineIntents.put({ intentId: 'slow', status: 'syncing', lastAttemptAt: new Date(now - 60000).toISOString() });
    assert.equal(await acquireSyncLease('first', now), true);
    assert.equal(await renewSyncLease('first', now + 30000), true);
    assert.equal(await acquireSyncLease('second', now + 50000), false);
    await resetStaleSyncingIntents(now + 50000, 'second');
    assert.equal((await database.offlineIntents.get('slow')).status, 'syncing');
    assert.equal(await renewSyncLease('second', now + 50000), false);
    assert.equal(await releaseSyncLease('second'), false);
    assert.equal(await acquireSyncLease('second', now + 80000), true);
    assert.equal(await renewSyncLease('first', now + 80000), false);
    assert.equal(await releaseSyncLease('first'), false);
    await resetStaleSyncingIntents(now + 80000, 'second');
    assert.equal((await database.offlineIntents.get('slow')).status, 'pending');
    await releaseSyncLease('second');
});

test('retry Intent executes all six stages and rejects other users, conflicts, and unverified sessions', async function() {
    var module = await loadModule('js/ICF/Intents/RetrySyncItemsIntent.js', {}, {}, true);
    var calls = [];
    var item = { id: 'saved', userId: 'staff', status: 'blocked_authentication', payload: {}, entityType: 'invoice' };
    var api = {
        getSession: function() { return { uid: 'staff', isAdmin: true }; },
        loadItems: async function(ids) { assert.deepEqual(Array.from(ids), ['saved']); return [item]; },
        verifyAuthentication: async function(uid) { assert.equal(uid, 'staff'); calls.push('verified'); },
        requeue: async function(items, uid, mode) { calls.push('requeued'); assert.equal(items[0].id, 'saved'); return 1; }
    };
    function intent(mode) { return module.default.createRetrySyncItemsIntent({ id: 'staff', role: 'admin' }, { itemIds: [' saved ', 'saved'], mode: mode || 'authentication' }, api); }
    assert.deepEqual(Object.keys(intent().stages), ['Validate','Normalize','AddContext','Authorize','Process','Emit']);
    var result = await pipeline.run(intent());
    assert.equal(result.ok, true);
    assert.equal(result.data.requeued, 1);
    assert.deepEqual(calls, ['verified', 'requeued']);
    item.userId = 'other';
    assert.equal((await pipeline.run(intent())).ok, false);
    item.userId = 'staff'; item.status = 'conflict';
    assert.equal((await pipeline.run(intent('manual'))).ok, false);
    item.status = 'failed_terminal';
    assert.equal((await pipeline.run(intent())).ok, false);
    assert.equal((await pipeline.run(intent('manual'))).ok, true);
    api.verifyAuthentication = async function() { throw new Error('expired'); };
    calls.length = 0;
    assert.equal((await pipeline.run(intent('manual'))).ok, false);
    assert.deepEqual(calls, []);
});

test('local support reports persist, stay account-scoped, redact secrets, and omit invoice payloads', async function() {
    await database.syncMetadata.clear();
    var auth = { currentUser: { uid: 'staff' } };
    var module = await loadModule('js/services/syncSupportService.js', {
        firebase: { auth: auth }, config: { APP_CONFIG: { VERSION: 'test', SERVICE_WORKER_VERSION: 'test' } },
        offlineDexieDb: { openOfflineDexieDatabase: async function() { return database; } }
    });
    var support = module.syncSupportService;
    await support.recordIssue({ id: 'failed', entityId: 'invoice-1', status: 'failed_terminal', message: 'Denied https://secret.test/key?token=abc person@example.test token=abc', payload: { customerName: 'Private Customer', secureToken: 'private-token' } });
    var report = await support.getReport();
    assert.equal(report.issues.length, 1);
    var serialized = JSON.stringify(report);
    for (var secret of ['secret.test', 'person@example', 'token=abc', 'Private Customer', 'private-token']) assert.ok(!serialized.includes(secret));
    await support.recordIssue({ id: 'failed', status: 'retry_wait', attemptCount: 2, needsReview: false });
    assert.equal((await support.getReport()).issues[0].history.length, 2);
    auth.currentUser = { uid: 'other' };
    assert.equal((await support.getReport()).issues.length, 0);
    auth.currentUser = { uid: 'staff' };
    assert.equal((await support.getReport()).issues.length, 1);
});

test('Sheets keeps missing configuration and uncertain delivery visible without claiming confirmation', async function() {
    var settings = { syncEnabled: true, googleSheetsWebhookUrl: '' };
    var recorded = [];
    var fetches = 0;
    var response = { type: 'opaque' };
    var module = await loadModule('js/services/googleSheetsService.js', {
        firebase: { auth: { currentUser: { uid: 'staff' } } },
        settingsService: { getGoogleSheetId: function() { return 'sheet'; }, settingsService: { getInvoiceSettings: async function() { return settings; } } },
        syncSupportService: { syncSupportService: { recordIssue: async function(issue) { recorded.push(issue); } } }
    }, { AbortController: AbortController, fetch: async function() { fetches += 1; return response; } });
    var service = module.googleSheetsService;
    var payload = { mode: 'append', invoiceId: 'i1', entityType: 'invoice' };
    var result = await service.postPayload(payload);
    assert.equal(result.needsReview, true);
    assert.equal(result.error.code, 'sheets_configuration_required');
    assert.equal(fetches, 0);
    settings.googleSheetsWebhookUrl = 'https://example.test';
    result = await service.postPayload(payload);
    assert.equal(result.confirmed, false);
    assert.equal(result.needsReview, true);
    assert.equal(recorded.length, 2);
    response = { ok: true, json: async function() { return { success: true, entityId: 'wrong' }; } };
    assert.equal((await service.postPayload(payload)).needsReview, true);
    response = { ok: true, json: async function() { return { success: true, entityId: 'i1' }; } };
    assert.equal((await service.postPayload(payload)).confirmed, true);
});

test('sync lease is released when setup fails before the processing loop', async function() {
    var released = 0;
    var cleared = 0;
    var module = await loadModule('js/services/syncService.js', {
        firebase: { auth: { currentUser: { uid: 'staff' } } },
        offlineStatusService: { offlineStatusService: { getSnapshot: function() { return {}; }, isOnline: function() { return true; } } },
        offlineQueueService: { offlineQueueService: {
            acquireSyncLease: async function() { return true; },
            recoverStaleSyncingItems: async function() { throw new Error('storage unavailable'); },
            releaseSyncLease: async function() { released += 1; }
        } }
    }, { setInterval: function() { return 12; }, clearInterval: function(id) { assert.equal(id, 12); cleared += 1; } });
    await assert.rejects(module.syncService.processQueue(), /storage unavailable/);
    assert.equal(released, 1);
    assert.equal(cleared, 1);
});

test('support panel escapes error content and offers retry only for held queue errors', async function() {
    var module = await loadModule('js/components/syncSupportPanel.js', {});
    var html = module.renderSyncSupportReport({ issues: [
        { id: 'a', source: 'queue', status: 'failed_terminal', errorCode: 'permission-denied', message: '<script>oops</script>', needsReview: true },
        { id: 'b', source: 'sheets', status: 'needs_review', errorCode: 'sheets_delivery_unconfirmed', needsReview: true }
    ] });
    assert.ok(html.includes('Copy report'));
    assert.ok(html.includes('Download report'));
    assert.ok(!html.includes('<script>'));
    assert.equal((html.match(/data-retry-sync=/g) || []).length, 1);
});

test('transactional retry preserves identity and payload, skips already-running work, and rejects account changes', async function() {
    await database.offlineIntents.clear();
    var auth = { currentUser: { uid: 'staff' } };
    var module = await loadModule('js/services/offlineQueueService.js', {
        firebase: { auth: auth },
        offlineDexieDb: { openOfflineDexieDatabase: async function() { return database; } },
        syncRetryPolicy: { SYNC_RETRY_STATUSES: { PENDING: 'pending', SYNCING: 'syncing', BLOCKED_AUTHENTICATION: 'blocked_authentication', FAILED_TERMINAL: 'failed_terminal', CONFLICT: 'conflict', RETRY_WAIT: 'retry_wait' } }
    });
    var service = module.offlineQueueService;
    await database.offlineIntents.bulkPut([
        { intentId: 'retry-me', actorId: 'staff', status: 'failed_terminal', payload: { firestorePatch: { totalAmount: 12 } } },
        { intentId: 'working', actorId: 'staff', status: 'syncing', payload: {} }
    ]);
    assert.equal(await service.requeueOwnedItems([{ id: 'retry-me' }, { id: 'working' }], 'staff', 'manual'), 1);
    var saved = await database.offlineIntents.get('retry-me');
    assert.equal(saved.intentId, 'retry-me');
    assert.equal(saved.payload.firestorePatch.totalAmount, 12);
    assert.equal((await database.offlineIntents.get('working')).status, 'syncing');
    assert.equal(await database.offlineIntents.count(), 2);
    auth.currentUser = { uid: 'other' };
    await assert.rejects(service.requeueOwnedItems([{ id: 'retry-me' }], 'staff', 'manual'), /account changed/);
});

test('queued invoice export is held after uncertain delivery and is not sent again on worker wake', async function() {
    var held = 0;
    var sent = 0;
    var effect = { id: 'export1', entityId: 'invoice1', actorId: 'staff', kind: 'invoice-sheets', nextAt: 0 };
    var scheduled = [];
    var module = await loadModule('js/services/workflowEffectsService.js', {
        authService: { authService: { getCurrentUser: function() { return { uid: 'staff' }; }, isAdmin: function() { return true; } } },
        store: { store: { getState: function() { return { adminProfile: { role: 'admin' } }; } } },
        workflowLocalStore: { workflowLocalStore: { markEffectSending: function() {}, list: function() { return [effect]; }, holdEffect: function() { held += 1; effect.needsReview = true; }, finishEffect: function() { assert.fail('Unconfirmed delivery must not be finished'); }, retryEffect: function() { assert.fail('Uncertain delivery must not be blindly resent'); } } },
        invoiceService: { invoiceService: { getCommittedInvoiceSnapshot: async function() { return { id: 'invoice1', status: 'fulfilled' }; } } },
        googleSheetsService: { googleSheetsService: { syncCompletedInvoice: async function() { sent += 1; return { success: true, confirmed: false, needsReview: true }; } } }
        ,RunWorkflowEffectIntent: { createRunWorkflowEffectIntent: function(actor, payload, context) { return { payload: payload, context: context }; } },
        pipeline: { run: async function(intent) { return { ok: true, data: await intent.context.api.performEffect(intent.payload.effect) }; } }
    }, { navigator: { onLine: true }, setTimeout: function(callback) { scheduled.push(callback); } });
    module.wakeWorkflowEffects(); scheduled.shift()();
    await new Promise(function(resolve) { setTimeout(resolve, 40); });
    assert.equal(sent, 1); assert.equal(held, 1);
    module.wakeWorkflowEffects(); scheduled.shift()();
    await new Promise(function(resolve) { setTimeout(resolve, 40); });
    assert.equal(sent, 1);
});

test('export started marker survives a restart and keeps the same delivery identity', async function() {
    var records = new Map();
    var localStorage = {
        getItem: function(key) { return records.get(key) || null; },
        setItem: function(key, value) { records.set(key, value); },
        removeItem: function(key) { records.delete(key); }
    };
    var modules = {
        authService: { authService: { getCurrentUser: function() { return { uid: 'staff' }; } } },
        invoiceProductivity: { createWorkflowId: function() { return 'stable-revision'; } }
    };
    var store = (await loadModule('js/services/workflowLocalStore.js', modules, { localStorage: localStorage })).workflowLocalStore;
    var effect = store.enqueue('invoice-sheets', 'invoice1', 'operation1');
    store.markEffectSending(effect);
    var reopened = (await loadModule('js/services/workflowLocalStore.js', modules, { localStorage: localStorage })).workflowLocalStore;
    var held = reopened.enqueue('invoice-sheets', 'invoice1', 'operation1');
    assert.equal(held.needsReview, true);
    assert.equal(held.errorCode, 'sheets_delivery_interrupted');
    assert.equal(held.revision, effect.revision);
    reopened.finishEffect(held);
    assert.equal(reopened.enqueue('invoice-sheets', 'invoice1', 'operation1').acknowledged, true);
});
