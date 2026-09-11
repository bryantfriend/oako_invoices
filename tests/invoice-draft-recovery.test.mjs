import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import path from 'node:path';
import { build } from 'esbuild';
import * as productivity from '../js/core/invoiceProductivity.js';
import * as operations from '../js/services/operationsPlanningService.js';

const bundles = new Map();
async function load(file, modules, globals = {}, keepIcf = false) {
    if (!bundles.has(file)) {
        const bundle = await build({
            entryPoints: [file], bundle: true, write: false, platform: 'node', format: 'cjs',
            supported: { 'dynamic-import': false },
            plugins: [{ name: 'recovery-boundaries', setup(api) {
                api.onResolve({ filter: /.*/ }, function resolve(args) {
                    if (args.kind === 'entry-point') return;
                    if (modules[path.basename(args.path, '.js')]) return { path: args.path, external: true };
                    if (keepIcf && !/\/services\/|\/core\/(authService|store|firebase|firestoreRead|i18n)\.js$|^https:/.test(args.path)) return;
                    return { path: args.path, external: true };
                });
            } }],
        });
        bundles.set(file, bundle.outputFiles[0].text);
    }
    const module = { exports: {} };
    vm.runInNewContext(bundles.get(file), Object.assign({
        module, exports: module.exports, Date, setTimeout, clearTimeout,
        console: { info() {}, warn() {}, error() {} },
        require(specifier) { return modules[path.basename(specifier, '.js')] || {}; },
    }, globals));
    return module.exports;
}

function copy(value) { return JSON.parse(JSON.stringify(value)); }
function draft() {
    return {
        requestId: 'previous-request', orderId: 'desk-previous-request',
        customerName: 'Корзинка', orderDate: '2026-09-12', notes: 'Delivery instructions',
        selectedPriceMode: 'business', entryMs: 30000,
        items: ['Багет', 'Кампань', 'Семена хлеб', 'Хлеб с отрубями'].map(function bread(name, index) {
            return { productId: 'bread-' + index, name, quantity: 3, unitPrice: 92, price: 92, priceMode: 'business' };
        }),
    };
}

async function fixture() {
    const initial = draft();
    const q = {
        orders: [Object.assign(productivity.normalizeWorkflowOrder(initial), { id: initial.orderId, createdBy: 'staff', archived: true })],
        invoices: [], writes: 0, prepared: [], checkpoints: [], effects: [],
        failRead: null, failCreate: false, failPrepare: false,
    };
    q.service = await load('js/services/invoiceWorkflowService.js', {
        operationsPlanningService: operations,
        firebase: { auth: { currentUser: { uid: 'staff' } } },
        settingsService: { settingsService: { async getInvoiceSettings() { return { storeId: 'KORG' }; } } },
        sessionDataStore: { updateOrderRecord() {}, updateInvoiceRecord() {} },
        workflowLocalStore: { workflowLocalStore: { event() {} } },
        workflowEffectsService: {
            getWorkflowSession() { return { uid: 'staff', role: 'admin', isAdmin: true }; },
            queueWorkflowEffect(kind, id) { q.effects.push([kind, id]); },
        },
        orderService: { orderService: {
            async getOrderById(id) {
                if (q.failRead) throw q.failRead;
                return q.orders.find(function byId(order) { return order.id === id; }) || null;
            },
            async createOrder(record, uid, options) {
                const id = 'desk-' + options.requestId;
                const existing = q.orders.find(function byId(order) { return order.id === id; });
                if (existing) return Object.assign({}, existing, { workflowReused: true });
                const created = Object.assign(copy(record), { id, createdBy: uid, archived: false });
                q.orders.push(created); q.writes += 1;
                if (q.failCreate) { q.failCreate = false; throw new Error('Lost save response'); }
                return created;
            },
            async updateOrderFromDailyOrders(id, record) {
                Object.assign(q.orders.find(function byId(order) { return order.id === id; }), copy(record));
                q.writes += 1;
            },
        } },
        invoiceService: { invoiceService: {
            async getInvoiceByOrderId(id) { return q.invoices.find(function byOrder(invoice) { return invoice.orderId === id; }); },
            async syncInvoiceWithOrder() {},
            async preparePrintableInvoice(id, record) {
                if (q.failPrepare) { q.failPrepare = false; throw new Error('Preview interrupted'); }
                let invoice = q.invoices.find(function byOrder(saved) { return saved.orderId === id; });
                if (!invoice) {
                    invoice = Object.assign(copy(record), { id: 'invoice-' + id, orderId: id, status: 'draft' });
                    q.invoices.push(invoice);
                }
                q.prepared.push(id);
                return { ok: true, data: { invoiceId: invoice.id, invoice } };
            },
        } },
    }, {}, true);
    q.options = { checkpoint(value) { q.checkpoints.push(copy(value)); } };
    return q;
}

test('the actual save intent reports archived and confirmed missing drafts without writing or preparing', async function () {
    const q = await fixture();
    for (const missing of [false, true]) {
        if (missing) q.orders.length = 0;
        const current = draft();
        await assert.rejects(q.service.saveAndPrepareInvoice(current, q.options), function recovery(error) {
            assert.equal(error.code, 'invoice-draft-needs-new-order');
            assert.match(error.message, missing ? /no longer exists/ : /was archived/);
            return true;
        });
        assert.equal(current.orderId, draft().orderId);
        assert.equal(current.requestId, draft().requestId);
        assert.deepEqual(current.items, draft().items);
    }
    assert.equal(q.writes, 0); assert.equal(q.prepared.length, 0); assert.equal(q.checkpoints.length, 0);
});

test('a lost earlier response cannot bypass archival by reusing just the request ID', async function () {
    const q = await fixture();
    const current = draft(); current.orderId = '';
    await assert.rejects(q.service.saveAndPrepareInvoice(current, q.options), { code: 'invoice-draft-needs-new-order' });
    assert.equal(q.writes, 0); assert.equal(q.orders.length, 1); assert.equal(q.orders[0].archived, true);
});

test('connection and permission errors retain retry identity and never offer new-order recovery', async function () {
    const q = await fixture();
    for (const code of ['unavailable', 'permission-denied', 'unauthenticated']) {
        q.failRead = Object.assign(new Error('Read failed'), { code });
        const current = draft();
        await assert.rejects(q.service.saveAndPrepareInvoice(current, q.options), function original(error) {
            assert.equal(error, q.failRead); return true;
        });
        assert.equal(current.requestId, draft().requestId);
    }
    assert.equal(q.writes, 0); assert.equal(q.prepared.length, 0);
});

test('changing customer or delivery date cannot overwrite a saved order', async function () {
    const q = await fixture(); q.orders[0].archived = false;
    const before = copy(q.orders[0]);
    for (const patch of [{ customerName: 'Next customer' }, { orderDate: '2026-09-13' }]) {
        await assert.rejects(q.service.saveAndPrepareInvoice(Object.assign(draft(), patch), q.options), { code: 'invoice-draft-needs-new-order' });
    }
    assert.deepEqual(q.orders[0], before); assert.equal(q.writes, 0); assert.equal(q.prepared.length, 0);
});

test('locked invoice retries reprint matching entries but reject changed quantities, prices, products and notes', async function () {
    const q = await fixture(); q.orders[0].archived = false;
    const invoice = Object.assign(copy(q.orders[0]), { id: 'printed', orderId: q.orders[0].id, status: 'approved', isPrinted: true });
    q.invoices.push(invoice);
    await q.service.saveAndPrepareInvoice(draft(), q.options);
    assert.equal(q.prepared.length, 1); assert.equal(q.writes, 0);
    const changes = [
        function quantity(current) { current.items[0].quantity = 5; },
        function price(current) { current.items[0].unitPrice = 100; },
        function product(current) { current.items[0].productId = 'different-bread'; },
        function notes(current) { current.notes = 'Changed delivery instructions'; },
    ];
    for (const change of changes) {
        const current = draft(); change(current);
        await assert.rejects(q.service.saveAndPrepareInvoice(current, q.options), { code: 'invoice-draft-needs-new-order' });
    }
    assert.equal(q.prepared.length, 1); assert.equal(q.writes, 0);
    invoice.status = 'draft'; // Legacy printed flags must also protect the paper.
    const changed = draft(); changed.items[0].quantity = 9;
    await assert.rejects(q.service.saveAndPrepareInvoice(changed, q.options), { code: 'invoice-draft-needs-new-order' });
    invoice.isPrinted = false; invoice.archived = true;
    await assert.rejects(q.service.saveAndPrepareInvoice(draft(), q.options), { code: 'invoice-draft-needs-new-order' });
});

test('an active draft still saves edited quantities on the same order', async function () {
    const q = await fixture(); q.orders[0].archived = false;
    const current = draft(); current.items[0].quantity = 5;
    await q.service.saveAndPrepareInvoice(current, Object.assign({}, q.options, { saveOnly: true }));
    assert.equal(q.orders.length, 1); assert.equal(q.orders[0].items[0].quantity, 5);
    assert.equal(q.prepared.length, 0); assert.equal(q.checkpoints[0].orderId, current.orderId);
});

// Minimal event surface for testing the real editor adapter, including its durable
// local checkpoint and print-window callbacks. Browser rendering is verified separately.
function element() {
    return { textContent: '', value: '', disabled: false, children: [], listeners: {},
        addEventListener(name, handler) { this.listeners[name] = handler; },
        focus() {}, replaceChildren() {}, append(child) { this.children.push(child); }, style: {},
    };
}
async function editor(q, storage) {
    const ids = {};
    for (const id of ['workflow-editor-actions', 'workflow-layout', 'workflow-draft-status', 'workflow-save', 'workflow-print', 'workflow-new', 'workflow-suggestions', 'workflow-refresh-suggestions', 'customerName']) ids['#' + id] = element();
    ids['#workflow-save'].dataset = { mode: 'save' }; ids['#workflow-print'].dataset = { mode: 'print' };
    ids['#workflow-editor-actions'].querySelector = function query(selector) { return ids[selector]; };
    const form = Object.assign(element(), {
        isConnected: true, elements: Object.values(ids),
        querySelector(selector) { return ids[selector]; }, reportValidity() { return true; },
    });
    const state = { entries: draft(), ids, form, popup: null, prints: [], errors: [] };
    const ui = await load('js/components/createOrderWorkflow.js', {
        invoiceProductivity: productivity, invoiceWorkflowService: q.service,
        orderService: { orderService: { async getOrdersByCustomerName() { return []; } } },
        notificationService: { notificationService: { error(message) { state.errors.push(message); } } },
        workflowLocalStore: { workflowLocalStore: {
            preference() { return { layout: 'full' }; }, read() { return copy(storage.value); },
            write(kind, id, value) { if (storage.fail) throw new Error('Storage full'); storage.value = copy(value); },
            remove() { storage.value = null; },
        } },
        nativeInvoicePrintService: {
            reserveInvoicePrintWindow() {
                state.popup = { closed: false, close() { this.closed = true; },
                    document: { body: element(), getElementById() { return null; }, createElement: element },
                };
                return state.popup;
            },
            async showNativeInvoicePrint(popup, invoices, settings, options) { state.prints.push({ invoices, options }); },
        },
    }, { window: { focus() {}, confirm() { return true; } } });
    ui.attachCreateOrderWorkflow({ form, settings: {},
        getDraft() { return copy(state.entries); }, restore(value) { state.entries = copy(value); },
        reset() { state.entries.items = []; },
    });
    state.submit = async function submit(mode = 'print') {
        await form.listeners.submit({ preventDefault() {}, submitter: ids[mode === 'save' ? '#workflow-save' : '#workflow-print'] });
    };
    return state;
}

test('editor recovery keeps all entries, survives interrupted preparation and reloads without duplicates', async function () {
    const q = await fixture(); const original = copy(q.orders[0]); const storage = { value: draft() };
    let ui = await editor(q, storage);
    await ui.submit();
    assert.equal(ui.ids['#workflow-print'].textContent, 'Save as new order & print');
    assert.match(ui.popup.document.body.textContent, /was archived/);
    assert.equal(ui.popup.document.body.children[0].textContent, 'Return to editor');
    ui.popup.document.body.children[0].onclick(); assert.equal(ui.popup.closed, true);
    ui.form.listeners.input();
    assert.match(ui.ids['#workflow-draft-status'].textContent, /Save them as a new order/);
    q.failPrepare = true;
    await ui.submit();
    assert.equal(q.orders.length, 2); assert.notEqual(storage.value.requestId, draft().requestId);
    const replacementId = storage.value.orderId;
    assert.equal(replacementId, 'desk-' + storage.value.requestId);
    assert.deepEqual(storage.value.items, draft().items); assert.deepEqual(q.orders[0], original);
    ui = await editor(q, storage); await ui.submit();
    assert.equal(q.orders.length, 2); assert.equal(q.invoices.length, 1);
    assert.equal(ui.prints[0].invoices[0].orderId, replacementId);
    assert.equal(ui.prints[0].invoices[0].totalAmount, 1104);
    ui.prints[0].options.onConfirmed(); assert.equal(storage.value, null);
});

test('a lost replacement save response retains its new request across reload and retries just once', async function () {
    const q = await fixture(); const storage = { value: draft() };
    let ui = await editor(q, storage); await ui.submit();
    q.failCreate = true; await ui.submit();
    const requestId = storage.value.requestId;
    assert.notEqual(requestId, draft().requestId); assert.equal(storage.value.orderId, '');
    assert.equal(q.orders.length, 2); assert.equal(q.invoices.length, 0);
    ui = await editor(q, storage); await ui.submit(); await ui.submit();
    assert.equal(storage.value.requestId, requestId);
    assert.equal(q.orders.length, 2); assert.equal(q.invoices.length, 1);
});

test('storage failure aborts recovery before creating anything; Save as new order also supports save-only', async function () {
    const q = await fixture(); const storage = { value: draft() };
    const ui = await editor(q, storage); await ui.submit('save');
    storage.fail = true; await ui.submit('save');
    assert.equal(q.writes, 0); assert.equal(storage.value.requestId, draft().requestId);
    assert.equal(ui.ids['#workflow-save'].textContent, 'Save as new order');
    storage.fail = false; await ui.submit('save');
    assert.equal(q.orders.length, 2); assert.equal(q.invoices.length, 0); assert.equal(ui.prints.length, 0);
    assert.deepEqual(storage.value.items, draft().items);
    assert.equal(ui.ids['#workflow-save'].textContent, 'Save order');
});
