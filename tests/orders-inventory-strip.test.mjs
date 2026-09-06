import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { getLocalDateKey } from '../js/core/dailyOrders.js';
import { buildInventoryOrderTotals, getInventoryProductQuantities } from '../js/core/inventoryQuantities.js';

var source = fs.readFileSync(new URL('../js/views/dashboardView.js', import.meta.url), 'utf8');

function section(start, end) {
    var startIndex = source.indexOf(start);
    var endIndex = source.indexOf(end, startIndex);
    assert.ok(startIndex >= 0 && endIndex > startIndex, 'Find the actual Orders view workflow');
    return source.slice(startIndex, endIndex);
}

// Execute the actual view's private load/render functions with controlled I/O and clock.
function createHarness() {
    var state = {
        now: Date.parse('2026-09-05T19:30:00Z'),
        orders: [], calls: [], rendered: [], timers: [], currentRoute: true,
        navigations: [], listeners: {}, refreshBarrier: null
    };
    class BishkekDate extends Date {
        constructor(value) { super(value === undefined ? state.now : value); }
        getFullYear() { return new Date(this.getTime() + 6 * 3600000).getUTCFullYear(); }
        getMonth() { return new Date(this.getTime() + 6 * 3600000).getUTCMonth(); }
        getDate() { return new Date(this.getTime() + 6 * 3600000).getUTCDate(); }
    }
    var products = Array.from({ length: 41 }, function(value, index) {
        return { id: 'product-' + index, displayName: 'Product ' + index };
    });
    var mount = { innerHTML: '' };
    function button(id) {
        return { addEventListener: function(event, callback) { state.listeners[id] = callback; } };
    }
    var context = vm.createContext({
        Date: BishkekDate,
        getLocalDateKey: getLocalDateKey,
        mountProductReconciliation: function() {},
        container: {},
        console: { info: function() {} },
        dashboardController: {
            refreshDashboard: async function() {
                if (state.refreshBarrier) await state.refreshBarrier;
                state.orders = [{ orderDate: '2026-09-06', status: 'draft', items: products.map(function(product) {
                    return { productId: product.id, quantity: 3 };
                }) }];
                return { orders: state.orders };
            }
        },
        inventoryController: {
            loadInventoryData: async function(date) {
                state.calls.push(date);
                var totals = buildInventoryOrderTotals(state.orders, date);
                return [{ name: 'Products', products: products.map(function(product) {
                    return Object.assign({}, product, getInventoryProductQuantities({ totalBaked: 20 }, totals[product.id]));
                }) }];
            }
        },
        document: { getElementById: function(id) {
            if (id === 'inventory-strip-wrapper') return mount;
            return button(id);
        } },
        router: { navigate: function(route) { state.navigations.push(route); } },
        ROUTES: { INVENTORY: 'inventory' },
        isNavigationStillCurrent: function() { return state.currentRoute; },
        ignoreStaleRouteResult: function() {},
        getScrollPosition: function() { return 0; },
        restoreScrollPosition: function() {},
        getActiveOrders: function(orders) { return orders; },
        refreshPrintableInvoiceMap: async function() {},
        notificationService: { error: function(message) { throw new Error(message); } },
        escapeHtml: function(value) { return String(value); },
        window: { setTimeout: function(callback) { state.timers.push(callback); } },
        recordRender: function(categories) { state.rendered.push(categories); }
    });
    var initialDate = source.match(/const today = [^;]+;/);
    vm.runInContext(`
        var navigationId = 1, expectedRoute = 'orders';
        var allOrders = [], activeOrders = [], returnOrders = [], returnInvoices = [];
        var intelligenceSettings = {}, inventoryCategories = [], inventoryDate = '';
        var pendingCheckmarkUpdates = new Set(), updatedCheckmarkUpdates = new Set();
        var renderUI = function() { recordRender(inventoryCategories); };
        ${initialDate ? initialDate[0] : ''}
        ${section('    const refreshDashboardDataPreservingState', '    const scheduleInvoiceListRefresh')}
        ${section('    const renderInventoryStrip', '    const renderBreakdownRow')}
        globalThis.workflow = {
            refresh: refreshDashboardDataPreservingState,
            strip: refreshInventoryStrip,
            initial: function(shouldRunBackgroundRefresh) {
                ${source.slice(source.includes('    // Initial stock refresh') ? source.indexOf('    // Initial stock refresh') : source.lastIndexOf('    window.setTimeout(function() {'), source.lastIndexOf('\n};'))}
            }
        };
    `, context);
    return { state: state, workflow: context.workflow, mount: mount };
}

test('Orders stock uses the same local day as Inventory before 06:00 in Bishkek', async function() {
    var harness = createHarness();
    await harness.workflow.strip();
    assert.deepEqual(harness.state.calls, ['2026-09-06']);
});

test('Orders stock recalculates today when refreshed after local midnight', async function() {
    var harness = createHarness();
    await harness.workflow.strip();
    harness.state.now += 86400000;
    await harness.workflow.strip();
    assert.deepEqual(harness.state.calls, ['2026-09-06', '2026-09-07']);
});

test('Orders refresh calculates all 41 remaining quantities after the orders refresh finishes', async function() {
    var harness = createHarness();
    var release;
    harness.state.refreshBarrier = new Promise(function(resolve) { release = resolve; });
    var pending = harness.workflow.refresh();
    var earlyCalls = harness.state.calls.length;
    release();
    await pending;
    assert.equal(earlyCalls, 0, 'Stock must wait for refreshed order quantities');
    var products = harness.state.rendered[0][0].products;
    assert.equal(products.length, 41);
    products.forEach(function(product) {
        assert.equal(product.left, 17, product.id);
        assert.equal(product.ordered, 3, product.id);
    });
});

test('Leaving Orders during its refresh does not start an Inventory request for the old route', async function() {
    var harness = createHarness();
    var release;
    harness.state.refreshBarrier = new Promise(function(resolve) { release = resolve; });
    var pending = harness.workflow.refresh();
    harness.state.currentRoute = false;
    release();
    await pending;
    assert.equal(harness.state.calls.length, 0);
    assert.equal(harness.state.rendered.length, 0);
});

test('Initial background order refresh does not launch a competing stock-only refresh', function() {
    var harness = createHarness();
    harness.state.refreshBarrier = new Promise(function() {});
    harness.workflow.initial(true);
    assert.equal(harness.state.timers.length, 0);
    assert.equal(harness.state.calls.length, 0);
});

test('Open Inventory works after the stock strip is inserted asynchronously', async function() {
    var harness = createHarness();
    await harness.workflow.strip();
    assert.equal(typeof harness.state.listeners['open-inventory-btn'], 'function');
    harness.state.listeners['open-inventory-btn']();
    assert.deepEqual(harness.state.navigations, ['inventory']);
});

test('Refresh Stock updates orders before showing the remaining quantities', async function() {
    var harness = createHarness();
    await harness.workflow.strip();
    assert.equal(typeof harness.state.listeners['refresh-stock-btn'], 'function');
    await harness.state.listeners['refresh-stock-btn']();
    harness.state.rendered[0][0].products.forEach(function(product) {
        assert.equal(product.left, 17);
    });
    assert.match(harness.mount.innerHTML, /2026-09-06/);
});
