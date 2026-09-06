import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { build } from 'esbuild';
import { buildProductionPlan } from '../js/services/operationsPlanningService.js';

var root = fileURLToPath(new URL('../', import.meta.url));
var bundle = await build({
    stdin: {
        contents: 'export { dailyOrdersController } from "./js/controllers/dailyOrdersController.js";\nexport { inventoryController } from "./js/controllers/inventoryController.js";',
        resolveDir: root
    },
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    plugins: [{
        name: 'inventory-test-service-boundaries',
        setup: function(api) {
            api.onResolve({ filter: /\/services\/|\/core\/(authService|store|notificationService|firebase|firestoreRead|i18n)\.js$|^https:/ }, function(args) {
                return { path: args.path, external: true };
            });
        }
    }]
});

function createHarness() {
    var categories = [{ id: 'bread', name: 'Bread' }, { id: 'other', name: 'Other products' }];
    var products = Array.from({ length: 41 }, function(value, index) {
        return { id: 'product-' + index, name: 'Product ' + index, categoryId: index < 11 ? 'bread' : 'other' };
    });
    var records = {};
    products.forEach(function(product) {
        records[product.id] = { totalBaked: 10, invoiceQuantity: 0, returnedQuantity: 0, availableQuantity: 10, locked: true };
    });
    var state = { orders: [], records: records, refreshedOrders: null, loads: [], errors: [] };
    var dependencies = {
        authService: { getCurrentUser: function() { return { uid: 'inventory-test-admin' }; } },
        store: { getState: function() { return { adminProfile: { role: 'admin' } }; } },
        i18n: { t: function(key) { return key; } },
        notificationService: {
            success: function() {},
            error: function(message) { state.errors.push(message); }
        },
        productService: {
            getAllProducts: async function() { return products; },
            getAllCategories: async function() { return categories; }
        },
        inventoryService: {
            getInventorySettings: async function() { return { enabledCategories: ['bread', 'other'] }; },
            getDailyInventory: async function() { return state.records; }
        },
        orderService: {
            createOrder: async function() { return 'order-' + (state.orders.length + 1); },
            updateOrderFromDailyOrders: async function() {},
            getAllOrders: async function() { return state.orders; }
        },
        sessionDataStore: {
            getOrdersSnapshot: function() { return { records: state.orders, shouldRefresh: false }; },
            loadOrders: async function(options) {
                state.loads.push(options);
                if (options.forceRefresh && state.refreshedOrders) state.orders = state.refreshedOrders;
                return { records: state.orders };
            },
            updateOrderRecord: function(id, patch) {
                var existing = state.orders.findIndex(function(order) { return order.id === id; });
                var saved = Object.assign({}, existing === -1 ? {} : state.orders[existing], patch, { id: id });
                if (existing === -1) state.orders.push(saved);
                else state.orders[existing] = saved;
            }
        }
    };
    var module = { exports: {} };
    vm.runInNewContext(bundle.outputFiles[0].text, {
        module: module,
        exports: module.exports,
        console: { info: function() {}, warn: function() {}, error: function() {} },
        require: function(specifier) {
            var name = path.basename(specifier, '.js');
            var dependency = dependencies[name] || {};
            return Object.assign({ [name]: dependency }, dependency);
        }
    });
    return { api: module.exports, state: state, products: products };
}

function makeDraft(products, quantity) {
    return {
        customerId: 'cafe', customerName: 'Cafe', orderDate: '2026-09-06',
        items: products.map(function(product) {
            return { productId: product.id, name: product.name, quantity: quantity, price: 100 };
        })
    };
}

async function loadRows(harness, options) {
    var groups = await harness.api.inventoryController.loadInventoryData('2026-09-06', options);
    assert.deepEqual(harness.state.errors, []);
    return groups.flatMap(function(group) { return group.products; });
}

test('saving and reducing Daily Orders updates Ordered and Left for all 41 products', async function() {
    var harness = createHarness();
    var saved = await harness.api.dailyOrdersController.saveOrder(makeDraft(harness.products, 3));
    var rows = await loadRows(harness);
    assert.equal(rows.length, 41);
    rows.forEach(function(row) {
        assert.equal(row.left, 7, row.id + ' remaining');
        assert.equal(row.ordered, 3, row.id + ' ordered');
    });

    var reduced = makeDraft(harness.products, 1);
    reduced.orderId = saved.id;
    await harness.api.dailyOrdersController.saveOrder(reduced);
    rows = await loadRows(harness);
    rows.forEach(function(row) {
        assert.equal(row.ordered, 1, row.id + ' reduced');
        assert.equal(row.left, 9, row.id + ' restored');
    });
});

test('invoice counters and fulfillment do not count a saved order twice', async function() {
    var harness = createHarness();
    await harness.api.dailyOrdersController.saveOrder(makeDraft(harness.products, 3));
    harness.products.forEach(function(product) {
        harness.state.records[product.id].invoiceQuantity = 3;
        harness.state.records[product.id].availableQuantity = 7;
    });
    for (var status of ['draft', 'confirmed', 'fulfilled', 'paid']) {
        harness.state.orders[0].status = status;
        harness.state.orders[0].fulfilledAt = '2026-09-07T10:00:00Z';
        var rows = await loadRows(harness);
        rows.forEach(function(row) {
            assert.equal(row.ordered, 3, status + ' ' + row.id);
            assert.equal(row.left, 7, status + ' ' + row.id);
        });
    }
    harness.state.orders[0].status = 'cancelled';
    var cancelledRows = await loadRows(harness);
    cancelledRows.forEach(function(row) {
        assert.equal(row.ordered, 0);
        assert.equal(row.left, 10);
    });
});

test('stock counts follow order date, numeric quantities, and returned items', async function() {
    var harness = createHarness();
    harness.state.orders = [
        { orderDate: '2026-09-06', status: 'draft', items: [{ productId: 'product-0', quantity: '2' }] },
        { orderDate: '2026-09-06', status: 'partially_returned', archived: true, items: [{ productId: 'product-0', quantity: '3', returnedQuantity: '1' }] },
        { deliveryDate: '2026-09-06', status: 'pending', items: [{ id: 'product-1', quantity: 0.5 }] },
        { orderDate: '2026-09-07', status: 'paid', fulfilledAt: '2026-09-06T12:00:00Z', items: [{ productId: 'product-0', quantity: 50 }] },
        { orderDate: '2026-09-06', status: 'draft', items: null }
    ];
    var rows = await loadRows(harness);
    assert.equal(rows[0].ordered, 5);
    assert.equal(rows[0].returned, 1);
    assert.equal(rows[0].left, 6);
    assert.equal(rows[1].ordered, 0.5);
    assert.equal(rows[1].left, 9.5);
});

test('Daily Orders quantity reductions replace stale adjusted quantities used for totals', async function() {
    var harness = createHarness();
    var draft = makeDraft([harness.products[0]], 2);
    draft.items[0].adjustedQuantity = 8;
    var saved = await harness.api.dailyOrdersController.saveOrder(draft);
    assert.equal(saved.items[0].adjustedQuantity, 2);
    assert.equal(saved.totalAmount, 200);
    var rows = await loadRows(harness);
    assert.equal(rows[0].ordered, 2);
    assert.equal(rows[0].left, 8);
});

test('Refresh Data requests current orders instead of reusing the previous totals', async function() {
    var harness = createHarness();
    harness.state.refreshedOrders = [Object.assign(makeDraft(harness.products, 4), { status: 'draft' })];
    var rows = await loadRows(harness, { forceRefresh: true });
    assert.equal(harness.state.loads.length, 1);
    assert.equal(harness.state.loads[0].forceRefresh, true);
    rows.forEach(function(row) {
        assert.equal(row.ordered, 4);
        assert.equal(row.left, 6);
    });
});

test('Production Planner does not subtract reservations for the same orders again', async function() {
    var harness = createHarness();
    await harness.api.dailyOrdersController.saveOrder(makeDraft(harness.products, 8));
    harness.state.orders[0].status = 'confirmed';
    var groups = await harness.api.inventoryController.loadInventoryData('2026-09-06');
    var plan = buildProductionPlan(harness.state.orders, groups, '2026-09-06');
    assert.equal(plan.rows.length, 41);
    plan.rows.forEach(function(row) {
        assert.equal(row.available, 10);
        assert.equal(row.required, 0);
        assert.equal(row.surplus, 2);
    });
});
