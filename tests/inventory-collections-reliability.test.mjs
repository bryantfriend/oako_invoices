import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModule } from './helpers/load-isolated-module.mjs';
import { parseProductionQuantity, validateInventoryEntry } from '../js/core/inventoryValidation.js';
import { buildCollectionRows } from '../js/services/operationsPlanningService.js';

async function harness() {
    var state = { records: {}, writes: [], source: 'server', rows: [], denied: new Set(), signedIn: true, retry: false };
    var sdk = {
        doc: function(db, collection, id) { return id; },
        collection: function() {}, query: function() {}, where: function() {}, serverTimestamp: function() { return 'timestamp'; },
        runTransaction: async function(db, callback) {
            var pending = [];
            var transaction = {
                get: async function(id) {
                    if (state.denied.has(id)) throw new Error('permission-denied');
                    var record = state.records[id];
                    var copy = record && Object.assign({}, record);
                    return { exists: function() { return Boolean(copy); }, data: function() { return copy; } };
                },
                set: function(id, patch) { pending.push({ id: id, patch: patch }); }
            };
            await callback(transaction);
            if (state.retry) {
                state.retry = false;
                state.records['2026-09-26_bread'].invoiceQuantity = 9;
                pending = [];
                await callback(transaction);
            }
            pending.forEach(function(commit) {
                state.records[commit.id] = Object.assign({}, state.records[commit.id], commit.patch);
                state.writes.push(commit);
            });
        },
        getDoc: async function() { throw new Error('unavailable'); }
    };
    var auth = {};
    Object.defineProperty(auth, 'currentUser', { get: function() { return state.signedIn ? { uid: 'admin' } : null; } });
    var module = await loadModule('js/services/inventoryService.js', {
        firebase: { db: {}, auth: auth },
        store: { store: { getState: function() { return { adminProfile: { role: 'admin' } }; } } },
        'firebase-firestore': sdk,
        firestoreRead: { getDocsWithCache: async function(query, options) {
            if (state.readError) throw new Error('unavailable');
            options.onReadSource(state.source);
            return state.rows;
        }, readCachedRowsAsync: async function() { return []; } },
        offlineStatusService: { offlineStatusService: { isOnline: function() { return false; } } }
    }, {}, true);
    return { state: state, service: module.inventoryService };
}

test('production transaction retries with fresh counters and never writes invoice-owned counters', async function() {
    var { state, service } = await harness();
    state.records['2026-09-26_bread'] = { totalBaked: 50, locked: false, invoiceQuantity: 5, returnedQuantity: 2 };
    state.retry = true;
    await service.saveProductionRecord('2026-09-26', 'bread', { totalBaked: 80.5 });
    assert.equal(state.records['2026-09-26_bread'].invoiceQuantity, 9);
    assert.equal(state.records['2026-09-26_bread'].availableQuantity, 73.5);
    assert.equal(Object.hasOwn(state.writes[0].patch, 'invoiceQuantity'), false);
    assert.equal(Object.hasOwn(state.writes[0].patch, 'returnedQuantity'), false);
});

test('lock-only mutation preserves newer production and counters', async function() {
    var { state, service } = await harness();
    state.records['2026-09-26_bread'] = { totalBaked: 80, locked: false, invoiceQuantity: 9, availableQuantity: 71 };
    var result = await service.setLockStatus('2026-09-26', [{ productId: 'bread', data: { locked: true } }]);
    assert.equal(result.ok, true);
    assert.equal(state.records['2026-09-26_bread'].totalBaked, 80);
    assert.equal(Object.hasOwn(state.writes[0].patch, 'totalBaked'), false);
    assert.equal(Object.hasOwn(state.writes[0].patch, 'availableQuantity'), false);
});

test('failed production save rejects, bulk mutation reports only failed products', async function() {
    var { state, service } = await harness();
    state.denied.add('2026-09-26_bad');
    await assert.rejects(service.saveProductionRecord('2026-09-26', 'bad', { totalBaked: 3 }), /permission-denied/);
    var result = await service.setLockStatus('2026-09-26', [ { productId: 'good', data: { locked: true } }, { productId: 'bad', data: { locked: true } } ]);
    assert.equal(result.ok, false);
    assert.deepEqual(Array.from(result.failed, function(row) { return row.productId; }), ['bad']);
    assert.equal(state.records['2026-09-26_good'].locked, true);
});

test('initialization cannot overwrite production created concurrently and accepts explicit zero', async function() {
    var { state, service } = await harness();
    state.records['2026-09-26_bread'] = { totalBaked: 80, locked: false };
    var result = await service.initializeDay('2026-09-26', [{ productId: 'bread', data: { totalBaked: 50 } }, { productId: 'new', data: { totalBaked: 0 } }]);
    assert.equal(result.ok, false);
    assert.equal(state.records['2026-09-26_bread'].totalBaked, 80);
    assert.equal(state.records['2026-09-26_new'].totalBaked, 0);
});

test('empty import and unauthenticated writes fail before any transaction', async function() {
    var { state, service } = await harness();
    await assert.rejects(service.importDay('2026-09-26', []), /No inventory/);
    state.signedIn = false;
    await assert.rejects(service.saveProductionRecord('2026-09-26', 'bread', { totalBaked: 2 }), /administrator/);
    assert.equal(state.writes.length, 0);
});

test('same-product edits serialize and locked production rejects subsequent edits', async function() {
    var { state, service } = await harness();
    await Promise.all([service.saveProductionRecord('2026-09-26', 'bread', { totalBaked: 5 }), service.saveProductionRecord('2026-09-26', 'bread', { totalBaked: 9 })]);
    assert.equal(state.records['2026-09-26_bread'].totalBaked, 9);
    await service.setLockStatus('2026-09-26', [{ productId: 'bread', data: { locked: true } }]);
    await assert.rejects(service.saveProductionRecord('2026-09-26', 'bread', { totalBaked: 20 }), /Unlock/);
});

test('failed or cached empty inventory cannot initialize; cached stock keeps source metadata', async function() {
    var { state, service } = await harness();
    state.readError = true;
    await assert.rejects(service.getDailyInventory('2026-09-26'), /unavailable/);
    state.readError = false;
    state.source = 'cache';
    await assert.rejects(service.getDailyInventory('2026-09-26'), /Could not confirm/);
    state.rows = [{ productId: 'bread', totalBaked: 10 }];
    var records = await service.getDailyInventory('2026-09-26');
    assert.equal(records.bread.totalBaked, 10);
    assert.equal(records.__readSource, 'cache');
    state.rows = []; state.source = 'server';
    assert.equal(Object.keys(await service.getDailyInventory('2026-09-26')).length, 0);
    await assert.rejects(service.getInventorySettings({ requireAvailable: true }), /unavailable/);
});

test('quantities reject blank negative invalid values and preserve fractions', function() {
    for (var value of ['', ' ', -1, Infinity, NaN, null, false, 'invalid']) assert.throws(function() { parseProductionQuantity(value); });
    assert.equal(parseProductionQuantity('2.75'), 2.75);
    assert.equal(parseProductionQuantity(0), 0);
    assert.throws(function() { validateInventoryEntry('2026-02-30', 'bread', { totalBaked: 2 }); });
    assert.throws(function() { validateInventoryEntry('2026-09-26', 'a/b', { totalBaked: 2 }); });
});

test('collections honors explicit zero and return-adjusted receivables without reviving paid or archived debts', function() {
    var rows = buildCollectionRows([
        { id: 'zero', status: 'confirmed', totalAmount: 1000, balanceDue: 0 },
        { id: 'primary-zero', status: 'confirmed', totalAmount: 1000, outstandingAmount: 0, balanceDue: 500 },
        { id: 'return', status: 'partially_returned', totalAmount: 1000, returnSummary: { adjustedTotalAmount: 700 }, amountPaid: 100 },
        { id: 'paid', status: 'paid', totalAmount: 1000 },
        { id: 'archived', status: 'confirmed', totalAmount: 1000, archived: true },
        { id: 'invalid', status: 'confirmed', totalAmount: Infinity }
    ], [], new Date());
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, 'return');
    assert.equal(rows[0].amount, 600);
});

test('queued lock follows pending production without restoring a stale total', async function() {
    var { state, service } = await harness();
    await Promise.all([
        service.saveProductionRecord('2026-09-26', 'bread', { totalBaked: 42 }),
        service.setLockStatus('2026-09-26', [{ productId: 'bread', data: { locked: true } }])
    ]);
    assert.equal(state.records['2026-09-26_bread'].totalBaked, 42);
    assert.equal(state.records['2026-09-26_bread'].locked, true);
});

test('view requests reject both older same-route loads and navigation away', async function() {
    var navigationId = 1;
    var route = 'inventory';
    var container = {};
    var module = await loadModule('js/core/viewRequestGuard.js', {
        routeGuard: {
            getCurrentNavigationId: function() { return navigationId; },
            getCurrentRoute: function() { return route; },
            isNavigationStillCurrent: function(id, name) { return id === navigationId && name === route; }
        }
    }, { document: { getElementById: function() { return container; } } });
    var begin = module.createViewRequestGuard();
    var old = begin(container);
    var current = begin(container);
    assert.equal(old(), false);
    assert.equal(current(), true);
    navigationId += 1; route = 'collections';
    assert.equal(current(), false);
});
