import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { build } from 'esbuild';
import * as archiveHelpers from '../js/core/archiveRecordHelpers.js';
import { createOrderArchiveAction } from '../js/components/orderArchiveAction.js';

let serviceSource;
async function fixture(options = {}) {
    if (!serviceSource) {
        const result = await build({ entryPoints: ['js/services/orderService.js'], bundle: true, write: false, format: 'cjs', platform: 'node',
            plugins: [{ name: 'boundaries', setup(api) {
                api.onResolve({ filter: /.*/ }, function(args) { if (args.kind !== 'entry-point') return { path: args.path, external: true }; });
            } }]
        });
        serviceSource = result.outputFiles[0].text;
    }
    const state = Object.assign({ server: {}, cache: {}, pending: {}, session: [], online: true, canRead: true, queued: [], creates: new Set(), transactions: 0 }, options);
    function snapshot(id, data) { return { id, exists() { return Boolean(data); }, data() { return structuredClone(data); } }; }
    const sdk = {
        doc(db, collection, id) { return { id, collection }; },
        async getDocFromServer(ref) {
            if (state.error) throw state.error;
            return snapshot(ref.id, state.server[ref.id]);
        },
        async getDocFromCache(ref) {
            if (!state.cache[ref.id]) throw new Error('No document in Firestore memory cache');
            return snapshot(ref.id, state.cache[ref.id]);
        },
        serverTimestamp() { return new Date(); },
        async runTransaction(db, callback) {
            state.transactions += 1;
            return callback({
                async get(ref) { return snapshot(ref.id, state.server[ref.id]); },
                update(ref, patch) { Object.assign(state.server[ref.id], patch); }
            });
        }
    };
    const modules = {
        firebase: { auth: { currentUser: { uid: 'staff' } }, db: {} },
        'firebase-firestore': sdk,
        archiveRecordHelpers: archiveHelpers,
        constants: { ORDER_STATUS: { DRAFT: 'draft' } },
        sessionDataStore: { getOrdersSnapshot() { return { records: state.session }; } },
        offlineStatusService: { offlineStatusService: { isOnline() { return state.online; }, canAttemptCloudRead() { return state.canRead; } } },
        offlineQueueService: { offlineQueueService: {
            async getLocalEntitySnapshots() { return state.pending; },
            async compactPendingOrderCreate(id, patch) {
                if (!state.creates.has(id)) return null;
                return Object.assign(state.pending[id], patch);
            },
            async enqueue(action, entity, id, payload) { state.queued.push({ action, entity, id, payload }); },
            async removePendingOrderCreate() { assert.fail('Archiving must never delete a queued order'); }
        } },
        dataIntegrityService: { dataIntegrityService: { async recordAuditLogSafely() {} } },
        googleSheetsService: { googleSheetsService: { async syncOrderLifecycle() { return { success: true }; } } }
    };
    const module = { exports: {} };
    new Function('require', 'module', 'exports', 'console', serviceSource)(
        function(specifier) { return modules[path.basename(specifier, '.js')] || {}; }, module, module.exports, { error() {}, warn() {} }
    );
    return { service: module.exports.orderService, state };
}

function saved(patch = {}) {
    return Object.assign({ id: 'o1', status: 'draft', archived: false, serverId: '', syncStatus: 'synced', updatedAt: '2026-09-11T12:00:00Z' }, patch);
}

test('an offline order visible in the account cache can be archived without a Firestore memory cache entry', async function() {
    const { service, state } = await fixture({ online: false, canRead: false, session: [saved()] });
    const result = await service.deleteOrder('o1');
    assert.equal(result.queued, true);
    assert.equal(state.queued[0].action, 'archiveOrder');
    assert.equal(state.queued[0].payload.baseUpdatedAtMillis, Date.parse('2026-09-11T12:00:00Z'));
    assert.equal(state.queued[0].payload.order.archived, true);
});

test('a saved order with a pending edit remains a saved order during offline archival', async function() {
    const pending = saved({ syncStatus: 'pending', syncAction: 'update' });
    const { service, state } = await fixture({ online: false, canRead: false, pending: { o1: pending } });
    const result = await service.deleteOrder('o1');
    assert.equal(result.localRemoved, undefined);
    assert.equal(state.queued.length, 1);
    assert.equal(state.queued[0].action, 'archiveOrder');
});

test('archiving an unsynced create preserves its identity, items and linked invoice', async function() {
    const pending = saved({ syncStatus: 'pending', syncAction: 'create', offlineCreated: true, invoiceId: 'invoice-1', items: [{ productId: 'bread', quantity: 4 }] });
    const { service, state } = await fixture({ online: false, canRead: false, pending: { o1: pending }, creates: new Set(['o1']) });
    const result = await service.deleteOrder('o1');
    assert.equal(result.local, true);
    assert.equal(state.pending.o1.archived, true);
    assert.equal(state.pending.o1.invoiceId, 'invoice-1');
    assert.equal(state.pending.o1.items[0].quantity, 4);
    assert.equal(state.creates.has('o1'), true);
});

test('a create acknowledged during archive lookup is archived on the server instead of reporting a false local success', async function() {
    const pending = saved({ syncAction: 'create', syncStatus: 'pending', offlineCreated: true });
    const { service, state } = await fixture({ server: { o1: saved() }, pending: { o1: pending } });
    const result = await service.archiveOrder('o1');
    assert.equal(result.local, undefined);
    assert.equal(state.transactions, 1);
    assert.equal(state.server.o1.archived, true);
});

test('read failures remain distinct from a server-confirmed missing order', async function() {
    const denied = Object.assign(new Error('Permission denied'), { code: 'permission-denied' });
    const deniedFixture = await fixture({ error: denied, session: [saved()] });
    await assert.rejects(deniedFixture.service.archiveOrder('o1'), function(error) { return error === denied; });
    const unavailable = Object.assign(new Error('Network unavailable'), { code: 'unavailable' });
    const failed = await fixture({ error: unavailable });
    await assert.rejects(failed.service.archiveOrder('o1'), function(error) { return error === unavailable; });
    const missing = await fixture({ session: [saved()] });
    await assert.rejects(missing.service.archiveOrder('o1'), { code: 'order-not-found' });
    assert.equal(missing.state.transactions, 0);
    const offline = await fixture({ online: false, canRead: false });
    await assert.rejects(offline.service.getOrderById('o1'), { code: 'unavailable' });
});

test('document IDs override embedded legacy IDs and pending snapshot IDs', async function() {
    const { service } = await fixture({ server: { o1: saved({ id: 'old-id' }) }, pending: { o1: saved({ id: '' }) } });
    assert.equal((await service.getOrderById('o1')).id, 'o1');
});

test('Sheets reads only committed data, never a newer local edit or an offline cache fallback', async function() {
    const { service, state } = await fixture({ server: { o1: saved({ quantity: 3 }) }, pending: { o1: saved({ quantity: 8 }) } });
    assert.equal((await service.getOrderById('o1')).quantity, 8);
    assert.equal((await service.getOrderById('o1', { committedOnly: true })).quantity, 3);
    state.error = Object.assign(new Error('Offline'), { code: 'unavailable' });
    state.cache.o1 = saved({ quantity: 8 });
    await assert.rejects(service.getOrderById('o1', { committedOnly: true }), { code: 'unavailable' });
});

test('archive button contains the reported rejection and allows a successful retry without hiding the row early', async function() {
    const errors = [];
    const applied = [];
    let fail = true;
    const action = createOrderArchiveAction({
        confirm() { return true; },
        async archiveOrders() {
            if (fail) throw new Error('Order not found.');
            return { failed: 0, succeeded: [{ result: { archived: true } }] };
        },
        applyArchive(id) { applied.push(id); },
        showError(message) { errors.push(message); }
    });
    await assert.doesNotReject(action('o1'));
    assert.deepEqual(errors, ['Order not found.']);
    assert.deepEqual(applied, []);
    fail = false;
    await action('o1');
    assert.deepEqual(applied, ['o1']);
});

test('archive button treats an already archived record as success and suppresses repeated clicks', async function() {
    let finish;
    let requests = 0;
    let applied = 0;
    const action = createOrderArchiveAction({
        confirm() { return true; },
        archiveOrders() { requests += 1; return new Promise(function(resolve) { finish = resolve; }); },
        applyArchive() { applied += 1; },
        showError(message) { assert.fail(message); }
    });
    const first = action('o1');
    await action('o1');
    assert.equal(requests, 1);
    finish({ failed: 0, succeeded: [], skipped: [{ result: { archived: true, alreadyArchived: true } }] });
    await first;
    assert.equal(applied, 1);
});

test('archive button reports ICF failures and honours cancelled confirmation', async function() {
    let confirmed = false;
    let requests = 0;
    let message;
    const action = createOrderArchiveAction({
        confirm() { return confirmed; },
        async archiveOrders() { requests += 1; return { failed: 1, failures: [{ message: 'Reconnect before archiving.' }] }; },
        applyArchive() { assert.fail('Failed archive cannot hide the order'); },
        showError(text) { message = text; }
    });
    await action('o1');
    assert.equal(requests, 0);
    confirmed = true;
    await action('o1');
    assert.equal(message, 'Reconnect before archiving.');
});
