import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import path from 'node:path';
import { build } from 'esbuild';
import {
    buildDailyBatchRows,
    normalizeWorkflowOrder,
    suggestReturnQuantities,
    summarizeWorkflowEvents,
    createEntryTimer,
    buildBakeryProgress,
} from '../js/core/invoiceProductivity.js';

async function loadModule(file, modules, globals = {}, keepIcf = false) {
    var bundle = await build({
        entryPoints: [file],
        bundle: true,
        write: false,
        platform: 'node',
        format: 'cjs',
        supported: { 'dynamic-import': false },
        plugins: [
            {
                name: 'isolated-boundaries',
                setup(api) {
                    api.onResolve({ filter: /.*/ }, function (args) {
                        if (args.kind === 'entry-point') return;
                        if (
                            keepIcf &&
                            !/\/services\/|\/core\/(authService|store|firebase|firestoreRead|i18n)\.js$|^https:/.test(
                                args.path,
                            )
                        )
                            return;
                        return { path: args.path, external: true };
                    });
                },
            },
        ],
    });
    var module = { exports: {} };
    vm.runInNewContext(
        bundle.outputFiles[0].text,
        Object.assign(
            {
                module,
                exports: module.exports,
                console: { info() {}, warn() {}, error() {} },
                Date,
                setTimeout,
                clearTimeout,
                require(specifier) {
                    var name = path.basename(specifier, '.js');
                    return modules[specifier] || modules[name] || {};
                },
            },
            globals,
        ),
    );
    return module.exports;
}

function draft() {
    return {
        requestId: 'test-request-001',
        customerName: ' Cafe ',
        orderDate: '2026-09-11',
        items: [{ productId: 'bread', name: 'Bread', quantity: 10, unitPrice: 100, price: 100 }],
    };
}

test('daily batch detects existing orders, uses current catalog prices and stable per-customer daily identities', function () {
    var customers = [
        { id: 'a', name: 'Cafe' },
        { id: 'b', name: 'Market' },
    ];
    var orders = [
        { id: 'old', customerName: 'Cafe', orderDate: '2026-09-10', items: draft().items },
        { id: 'today', customerName: 'Market', orderDate: '2026-09-11', items: draft().items },
    ];
    var products = [{ id: 'bread', name: 'Bread', price: 120 }];
    var rows = buildDailyBatchRows(customers, orders, products, '2026-09-11', 'retail');
    assert.equal(rows[0].items[0].unitPrice, 120);
    assert.equal(rows[0].selected, true);
    assert.match(rows[0].warnings[0], /current catalog price/);
    assert.equal(rows[1].existingOrderId, 'today');
    assert.equal(rows[1].selected, false);
    assert.equal(rows[1].items[0].unitPrice, 100, 'existing order keeps its saved price');
    assert.equal(
        buildDailyBatchRows(customers, orders, products, '2026-09-11', 'retail')[0].requestId,
        rows[0].requestId,
    );
    assert.notEqual(
        buildDailyBatchRows(customers, orders, products, '2026-09-12', 'retail')[0].requestId,
        rows[0].requestId,
    );
});

test('return suggestions require completed history and never silently apply quantities', function () {
    var items = draft().items;
    var history = Array.from({ length: 3 }, function () {
        return { status: 'paid', items: [{ productId: 'bread', quantity: 10, returnedQuantity: 3 }] };
    });
    assert.equal(suggestReturnQuantities(items, history.slice(0, 2)).length, 0);
    var suggestion = suggestReturnQuantities(items, history)[0];
    assert.equal(suggestion.suggested, 7);
    assert.equal(suggestion.samples, 3);
    assert.equal(items[0].quantity, 10);
    assert.equal(
        suggestReturnQuantities([{ ...items[0], quantity: 7 }], history).length,
        0,
        'accepting does not compound reductions',
    );
    assert.equal(
        suggestReturnQuantities(
            items,
            history.map(function (order) {
                return { ...order, status: 'draft' };
            }),
        ).length,
        0,
    );
    assert.equal(normalizeWorkflowOrder(draft()).totalAmount, 1000);
});

test('workflow metrics exclude idle gaps and use medians; shared bakery deduplicates orders', function () {
    var now = 1000;
    var timer = createEntryTimer(0, function () {
        return now;
    });
    timer.touch();
    now += 5000;
    timer.touch();
    now += 3600000;
    timer.touch();
    assert.equal(timer.value(), 5000);
    var stats = summarizeWorkflowEvents([
        { type: 'prepared', entryMs: 1000, durationMs: 500 },
        { type: 'prepared', entryMs: 3000, durationMs: 1500 },
        { type: 'preparation_failed' },
        { type: 'reprint' },
    ]);
    assert.equal(stats.prepareMs, 1000);
    assert.equal(stats.entryMs, 2000);
    assert.equal(stats.failures, 1);
    assert.equal(stats.reprints, 1);
    var order = { id: 'a', orderDate: '2026-09-11', isPrinted: true, status: 'confirmed' };
    assert.deepEqual(
        buildBakeryProgress([order, order, { ...order, id: 'b', archived: true }], '2026-09-11'),
        { total: 1, printed: 1, complete: true },
    );
});

test('durable background records survive reload, stay account-scoped, and retain newer revisions', async function () {
    var values = new Map();
    var uid = 'staff-a';
    var sequence = 0;
    var storage = {
        get length() {
            return values.size;
        },
        key(index) {
            return [...values.keys()][index];
        },
        getItem(key) {
            return values.get(key) || null;
        },
        setItem(key, value) {
            values.set(key, value);
        },
        removeItem(key) {
            values.delete(key);
        },
    };
    var modules = {
        authService: {
            authService: {
                getCurrentUser() {
                    return { uid };
                },
            },
        },
        invoiceProductivity: {
            createWorkflowId() {
                return String(++sequence);
            },
        },
    };
    var first = (await loadModule('js/services/workflowLocalStore.js', modules, { localStorage: storage }))
        .workflowLocalStore;
    var old = first.enqueue('sheets', 'order-1');
    var reloaded = (await loadModule('js/services/workflowLocalStore.js', modules, { localStorage: storage }))
        .workflowLocalStore;
    assert.equal(reloaded.list('effects').length, 1);
    reloaded.enqueue('sheets', 'order-1');
    first.finishEffect(old);
    assert.equal(reloaded.list('effects').length, 1);
    uid = 'staff-b';
    assert.equal(reloaded.list('effects').length, 0);
    uid = 'staff-a';
    reloaded.finishEffect(reloaded.list('effects')[0]);
    assert.equal(reloaded.list('effects').length, 0);
    storage.setItem = function () {
        throw new Error('Quota');
    };
    assert.throws(function () {
        first.write('draft', 'editor', draft());
    }, /Quota/);
});

test('save pipeline checkpoints before preparation, preserves recovery ID and rejects unauthorized writes', async function () {
    var modules = { firebase: { auth: { currentUser: { uid: 'staff' } } } };
    var factory = (await loadModule('js/ICF/Intents/SaveAndPrepareInvoiceIntent.js', modules, {}, true))
        .default;
    var pipeline = (await loadModule('js/ICF/engine/pipeline.js', {})).default;
    var calls = [];
    var current = draft();
    var api = {
        getSession() {
            return { uid: 'staff', isAdmin: true };
        },
        async save() {
            calls.push('save');
            return { id: 'saved-order' };
        },
        checkpoint(value) {
            calls.push('checkpoint');
            assert.equal(value.orderId, 'saved-order');
        },
        async prepare() {
            calls.push('prepare');
            throw new Error('Printer data unavailable');
        },
    };
    var actor = { id: 'staff', role: 'admin' };
    var intent = factory.createSaveAndPrepareInvoiceIntent(actor, { draft: current }, { api });
    assert.deepEqual(Object.keys(intent.stages), [
        'Validate',
        'Normalize',
        'AddContext',
        'Authorize',
        'Process',
        'Emit',
    ]);
    var result = await pipeline.run(intent);
    assert.equal(result.ok, false);
    assert.deepEqual(calls, ['save', 'checkpoint', 'prepare']);
    assert.equal(current.orderId, 'saved-order');
    calls.length = 0;
    result = await pipeline.run(
        factory.createSaveAndPrepareInvoiceIntent(
            { id: 'stranger', role: 'admin' },
            { draft: current },
            { api },
        ),
    );
    assert.equal(result.ok, false);
    assert.deepEqual(calls, []);
});

test('batch preparation reports partial failure and checkpoints every row for retry', async function () {
    var factory = (await loadModule('js/ICF/Intents/PrepareInvoiceBatchIntent.js', {}, {}, true)).default;
    var pipeline = (await loadModule('js/ICF/engine/pipeline.js', {})).default;
    var checkpoints = 0;
    var rows = [{ requestId: 'one' }, { requestId: 'two' }];
    var api = {
        getSession() {
            return { uid: 'staff', isAdmin: true };
        },
        async prepareRow(row) {
            if (row.requestId === 'two') throw new Error('offline');
            return { order: { id: 'o1' }, invoice: { id: 'i1' } };
        },
        checkpointBatch() {
            checkpoints += 1;
        },
    };
    var result = await pipeline.run(
        factory.createPrepareInvoiceBatchIntent({ id: 'staff', role: 'admin' }, { rows }, { api }),
    );
    assert.equal(result.ok, true);
    assert.equal(result.data.completed.length, 1);
    assert.equal(result.data.failed.length, 1);
    assert.equal(checkpoints, 2);
    assert.equal(rows[0].invoiceId, 'i1');
    assert.equal(rows[1].status, 'failed');
});

function firestoreHarness() {
    var records = new Map();
    var serial = Promise.resolve();
    var counter = 0;
    var sdk = {
        collection(db, name) {
            return name;
        },
        doc(db, collection, id) {
            var key = arguments.length === 1 ? db + '/auto-' + ++counter : collection + '/' + id;
            return { key, id: key.split('/').pop() };
        },
        serverTimestamp() {
            return new Date();
        },
        runTransaction(db, action) {
            var result = serial.then(function () {
                return action({
                    async get(ref) {
                        var value = records.get(ref.key);
                        return {
                            exists() {
                                return !!value;
                            },
                            data() {
                                return value;
                            },
                        };
                    },
                    set(ref, value) {
                        records.set(ref.key, structuredClone(value));
                    },
                });
            });
            serial = result.catch(function () {});
            return result;
        },
    };
    return { sdk, records };
}

test('online order retry and double submission create exactly one order and queue Sheets without awaiting its network', async function () {
    var fake = firestoreHarness();
    var effects = [];
    var service = (
        await loadModule('js/services/orderService.js', {
            'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js': fake.sdk,
            firebase: { auth: { currentUser: { uid: 'staff' } }, db: {} },
            workflowEffectsService: {
                queueWorkflowEffect(...args) {
                    effects.push(args);
                },
            },
            offlineStatusService: {
                offlineStatusService: {
                    isOnline() {
                        return true;
                    },
                },
            },
            dataIntegrityService: { dataIntegrityService: { async recordAuditLogSafely() {} } },
            constants: { ORDER_STATUS: { DRAFT: 'draft' } },
        })
    ).orderService;
    var saved = await Promise.all([
        service.createOrder(normalizeWorkflowOrder(draft()), 'staff', {
            requestId: 'same-request',
            returnRecord: true,
        }),
        service.createOrder(normalizeWorkflowOrder(draft()), 'staff', {
            requestId: 'same-request',
            returnRecord: true,
        }),
    ]);
    assert.equal(fake.records.size, 1);
    assert.equal(saved[0].id, saved[1].id);
    assert.equal(saved[1].workflowReused, true);
    assert.equal(effects.length, 2);
    assert.equal(saved[0].id, 'desk-same-request');
    assert.equal(effects[0][1], 'desk-same-request');
    await assert.rejects(
        service.createOrder(normalizeWorkflowOrder(draft()), 'another-staff', { requestId: 'same-request' }),
        /existing order/,
    );
});

test('concurrent print rewards are verified against saved state and awarded once globally', async function () {
    var fake = firestoreHarness();
    fake.records.set('invoices/i1', { isPrinted: true });
    fake.records.set('invoices/i2', { isPrinted: false });
    var service = (
        await loadModule('js/services/gamificationService.js', {
            'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js': fake.sdk,
            firebase: { auth: { currentUser: { uid: 'staff', email: 'staff@example.test' } }, db: {} },
            workflowLocalStore: {
                workflowLocalStore: {
                    preference() {
                        return { fun: false };
                    },
                },
            },
        })
    ).gamificationService;
    await Promise.all([
        service.awardWorkflowAction('invoicesPrinted', 'i1'),
        service.awardWorkflowAction('invoicesPrinted', 'i1'),
    ]);
    assert.equal(fake.records.get('users/staff').actions.invoicesPrinted, 1);
    assert.equal(fake.records.get('users/staff').xp, 15);
    await assert.rejects(service.awardWorkflowAction('invoicesPrinted', 'i2'), /confirmed printing/);
    assert.equal(fake.records.has('workflow_rewards/invoicesPrinted-i2'), false);
    await assert.rejects(service.awardWorkflowAction('unknown', 'i1'), /Unknown/);
});

test('offline retry preserves the original queued create and returns the same recovery ID', async function () {
    var snapshots = {};
    var writes = 0;
    var service = (
        await loadModule('js/services/orderService.js', {
            firebase: { auth: { currentUser: { uid: 'staff' } }, db: {} },
            offlineStatusService: {
                offlineStatusService: {
                    isOnline() {
                        return false;
                    },
                },
            },
            offlineQueueService: {
                offlineQueueService: {
                    async getLocalEntitySnapshots() {
                        return snapshots;
                    },
                    async enqueue(action, entity, id, payload) {
                        writes += 1;
                        snapshots[id] = payload.order;
                    },
                },
            },
            constants: { ORDER_STATUS: { DRAFT: 'draft' } },
        })
    ).orderService;
    var first = await service.createOrder(normalizeWorkflowOrder(draft()), 'staff', {
        requestId: 'offline-request',
        returnRecord: true,
    });
    var retry = await service.createOrder(normalizeWorkflowOrder(draft()), 'staff', {
        requestId: 'offline-request',
        returnRecord: true,
    });
    assert.equal(writes, 1);
    assert.equal(first.id, retry.id);
    assert.equal(retry.workflowReused, true);
});

test('validation rejects negative quantities and calendar rollover without saving', async function () {
    var factory = (await loadModule('js/ICF/Intents/SaveAndPrepareInvoiceIntent.js', {}, {}, true)).default;
    var pipeline = (await loadModule('js/ICF/engine/pipeline.js', {})).default;
    var api = {
        getSession() {
            return { uid: 'staff', isAdmin: true };
        },
        async save() {
            assert.fail('invalid draft must not save');
        },
    };
    for (var current of [
        { ...draft(), orderDate: '2026-02-31' },
        { ...draft(), items: [...draft().items, { quantity: -1 }] },
    ]) {
        var result = await pipeline.run(
            factory.createSaveAndPrepareInvoiceIntent({ id: 'staff' }, { draft: current }, { api }),
        );
        assert.equal(result.ok, false);
    }
});

test('Sheets requests time out and report a retryable failure', async function () {
    var signal;
    var service = (
        await loadModule(
            'js/services/googleSheetsService.js',
            {
                settingsService: {
                    getGoogleSheetId() {
                        return 'sheet';
                    },
                    settingsService: {
                        async getInvoiceSettings() {
                            return { syncEnabled: true, googleSheetsWebhookUrl: 'https://example.test' };
                        },
                    },
                },
            },
            {
                AbortController,
                setTimeout(fn) {
                    queueMicrotask(fn);
                    return 1;
                },
                clearTimeout() {},
                fetch(url, options) {
                    signal = options.signal;
                    return new Promise(function (resolve, reject) {
                        signal.addEventListener('abort', function () {
                            reject(new Error('Timed out'));
                        });
                    });
                },
            },
        )
    ).googleSheetsService;
    var result = await service.postPayload({ mode: 'upsert' });
    assert.equal(signal.aborted, true);
    assert.equal(result.success, false);
});

test('background Sheets effect waits for its queued order revision to commit', async function () {
    var scheduled = [];
    var retries = 0;
    var finished = 0;
    var sent = 0;
    var lastError;
    var order = { id: 'o1', localUpdatedAt: '2026-09-11T10:00:00Z' };
    var effect = {
        id: 'sheet-o1',
        kind: 'sheets',
        entityId: 'o1',
        actorId: 'staff',
        nextAt: 0,
        expectedAt: '2026-09-11T10:01:00Z',
    };
    var worker = await loadModule(
        'js/services/workflowEffectsService.js',
        {
            authService: {
                authService: {
                    getCurrentUser() {
                        return { uid: 'staff' };
                    },
                    isAdmin() {
                        return true;
                    },
                },
            },
            store: {
                store: {
                    getState() {
                        return { adminProfile: { role: 'admin' } };
                    },
                },
            },
            workflowLocalStore: {
                workflowLocalStore: {
                    list() {
                        return [effect];
                    },
                    finishEffect() {
                        finished += 1;
                    },
                    retryEffect(effect, error) {
                        retries += 1;
                        lastError = error.message;
                    },
                },
            },
            orderService: {
                orderService: {
                    async getOrderById() {
                        return order;
                    },
                },
            },
            googleSheetsService: {
                googleSheetsService: {
                    async syncOrderLifecycle() {
                        sent += 1;
                        return { success: true };
                    },
                },
            },
            RunWorkflowEffectIntent: {
                createRunWorkflowEffectIntent(actor, payload, context) {
                    return { payload, context };
                },
            },
            pipeline: {
                async run(intent) {
                    await intent.context.api.performEffect(intent.payload.effect);
                    return { ok: true };
                },
            },
        },
        {
            navigator: { onLine: true },
            setTimeout(fn) {
                scheduled.push(fn);
                return 1;
            },
        },
    );
    worker.wakeWorkflowEffects();
    scheduled.shift()();
    await new Promise(setImmediate);
    assert.equal(retries, 1);
    assert.match(lastError, /Waiting for the order update to commit/);
    assert.equal(sent, 0);
    assert.equal(finished, 0);
    order.localUpdatedAt = effect.expectedAt;
    worker.wakeWorkflowEffects();
    scheduled.shift()();
    await new Promise(setImmediate);
    assert.equal(sent, 1, lastError);
    assert.equal(finished, 1);
});

test('native print document keeps odd two-up sheets and text pages without rasterization', async function () {
    var service = await loadModule('js/services/nativeInvoicePrintService.js', {});
    var document = service.buildNativePrintDocument(
        [
            '<div class="invoice-page">Кыргызча А</div>',
            '<div class="invoice-page">Б</div>',
            '<div class="invoice-page">В</div>',
        ],
        'two-up-portrait',
        'http://localhost/',
        'a4',
    );
    assert.equal((document.match(/class="print-sheet"/g) || []).length, 2);
    assert.equal((document.match(/class="print-slot"/g) || []).length, 4);
    assert.match(document, /Кыргызча А/);
    assert.match(document, /rotate\(90deg\)/);
    assert.doesNotMatch(document, /canvas|data:image/);
    assert.match(document, /job-confirm" disabled/);
});

test('a batch detects a newly saved order and requires review before reusing it', async function () {
    var prepared = 0;
    var saved = { id: 'another-order', customerName: 'Cafe', orderDate: '2026-09-11', createdBy: 'other-staff', items: [{ productId: 'bread', quantity: 6, unitPrice: 125 }] };
    var service = await loadModule('js/services/invoiceWorkflowService.js', {
        orderService: { orderService: { async getOrdersByCustomerName() { return [saved]; }, async getOrderById() { return saved; } } },
        invoiceService: { invoiceService: { async preparePrintableInvoice() { prepared += 1; return { ok: true, data: { invoiceId: 'i1', invoice: { id: 'i1' } } }; } } },
        operationsPlanningService: { getLocalDateKey(value) { return value; } },
        workflowEffectsService: { getWorkflowSession() { return { uid: 'staff', role: 'admin', isAdmin: true }; } },
        workflowLocalStore: { workflowLocalStore: { event() {} } },
        sessionDataStore: { updateInvoiceRecord() {}, updateOrderRecord() {} },
        PrepareInvoiceBatchIntent: { createPrepareInvoiceBatchIntent(actor, payload, context) { return { payload, context }; } },
        pipeline: { async run(intent) { var row = intent.payload.rows[0]; var result = await intent.context.api.prepareRow(row); return { ok: true, data: { completed: [result], failed: [] } }; } }
    });
    var row = draft();
    await assert.rejects(service.prepareDailyInvoiceBatch([row], function () {}), /Review its saved quantities/);
    assert.equal(prepared, 0); assert.equal(row.existingOrderId, saved.id); assert.equal(row.items[0].quantity, 6);
    await service.prepareDailyInvoiceBatch([row], function () {});
    assert.equal(prepared, 1);
});
