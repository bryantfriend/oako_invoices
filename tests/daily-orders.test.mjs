import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
    buildDailyOrderProductColumns,
    getDailyOrderRowQuantities,
    getDailyOrderFilter,
    getOrdersForDate,
    getVisibleOrderItems,
    summarizeDailyOrders
} from '../js/core/dailyOrders.js';
import validateSaveDailyOrderPayloadModule from '../js/ICF/Stages/Validators/Orders/validateSaveDailyOrderPayload.js';
import normalizeSaveDailyOrderPayloadModule from '../js/ICF/Stages/Normalizers/Orders/normalizeSaveDailyOrderPayload.js';
import processSaveDailyOrderModule from '../js/ICF/Stages/Processors/Orders/processSaveDailyOrder.js';
import emitSaveDailyOrderResultModule from '../js/ICF/Stages/Emitters/Orders/emitSaveDailyOrderResult.js';

var categories = [
    { id: 'bread', name: 'Breads' },
    { id: 'drinks', name: 'Drinks' }
];
var products = [
    { id: 'loaf', name: 'Country loaf', categoryId: 'bread' },
    { id: 'juice', name: 'Apple juice', categoryId: 'drinks' }
];

test('Daily Orders defaults to bread categories until its filter is configured', function() {
    var defaultFilter = getDailyOrderFilter({}, categories);
    assert.deepEqual(defaultFilter.categoryIds, ['bread']);
    assert.equal(defaultFilter.usesBreadDefault, true);

    var configuredAll = getDailyOrderFilter({ dailyOrderFilterConfigured: true }, categories);
    assert.deepEqual(configuredAll.categoryIds, []);
    assert.equal(configuredAll.usesBreadDefault, false);
});

test('Daily Orders filters the chosen day and summarizes visible quantities', function() {
    var orders = [
        { id: 'one', orderDate: '2026-08-24', items: [{ productId: 'loaf', name: 'Country loaf', quantity: 3 }, { productId: 'juice', name: 'Apple juice', quantity: 2 }] },
        { id: 'drink-only', orderDate: '2026-08-24', items: [{ productId: 'juice', name: 'Apple juice', quantity: 4 }] },
        { id: 'archived', archived: true, orderDate: '2026-08-24', items: [{ productId: 'loaf', name: 'Country loaf', quantity: 1 }] },
        { id: 'two', orderDate: '2026-08-25', items: [{ productId: 'loaf', name: 'Country loaf', quantity: 5 }] }
    ];
    var selected = getOrdersForDate(orders, '2026-08-24', products, categories, {});
    var items = getVisibleOrderItems(selected[0], products, categories, {});
    var summary = summarizeDailyOrders(selected, products, categories, {});

    assert.deepEqual(selected.map(function(order) { return order.id; }), ['one', 'drink-only', 'archived']);
    assert.deepEqual(items.map(function(item) { return item.productId; }), ['loaf']);
    assert.equal(summary.orderCount, 3);
    assert.equal(summary.productCount, 1);
    assert.equal(summary.unitCount, 4);
});

test('Daily Orders builds one product column with a top total and per-order quantities', function() {
    var orderRows = [
        { id: 'one', orderDate: '2026-08-24', items: [{ productId: 'loaf', name: 'Country loaf', quantity: 3 }] },
        { id: 'two', orderDate: '2026-08-24', items: [{ productId: 'loaf', name: 'Country loaf', quantity: 2 }] }
    ];
    var columns = buildDailyOrderProductColumns(orderRows, products, categories, {});
    var firstRow = getDailyOrderRowQuantities(orderRows[0], products, categories, {});

    assert.equal(columns.length, 1);
    assert.equal(columns[0].name, 'Country loaf');
    assert.equal(columns[0].total, 5);
    assert.equal(firstRow.loaf, 3);
});

test('SaveDailyOrder stages reject zero-only drafts and create normalized orders', async function() {
    var invalidIntent = {
        payload: {
            customerName: 'Cafe',
            orderDate: '2026-08-24',
            items: [{ quantity: 0 }],
            orderApi: { createOrder: function() {}, updateOrder: function() {} }
        }
    };
    assert.equal(validateSaveDailyOrderPayloadModule.validateSaveDailyOrderPayload(invalidIntent).ok, false);

    var calls = [];
    var intent = {
        payload: {
            customerId: 'customer-1',
            customerName: ' Cafe ',
            orderDate: '2026-08-24',
            notes: ' Morning ',
            selectedPriceMode: 'retail',
            userId: 'admin-1',
            items: [{ productId: 'loaf', name: 'Country loaf', quantity: 2, unitPrice: 100, price: 100 }],
            orderApi: {
                createOrder: async function(order, userId) { calls.push({ order: order, userId: userId }); return 'new-order'; },
                updateOrder: async function() {}
            }
        },
        context: {}
    };
    normalizeSaveDailyOrderPayloadModule.normalizeSaveDailyOrderPayload(intent);
    await processSaveDailyOrderModule.processSaveDailyOrder(intent);
    emitSaveDailyOrderResultModule.emitSaveDailyOrderResult(intent);

    assert.equal(intent.payload.customerName, 'Cafe');
    assert.equal(calls[0].order.customerId, 'customer-1');
    assert.equal(intent.payload.totalAmount, 200);
    assert.equal(calls[0].userId, 'admin-1');
    assert.equal(intent.context.resultData.orderId, 'new-order');
    assert.equal(intent.context.events[0].type, 'DailyOrderCreated');
});

test('SaveDailyOrderIntent registers every required ICF stage', function() {
    var source = fs.readFileSync(new URL('../js/ICF/Intents/SaveDailyOrderIntent.js', import.meta.url), 'utf8');
    ['Validate', 'Normalize', 'AddContext', 'Authorize', 'Process', 'Emit'].forEach(function(stageName) {
        assert.match(source, new RegExp(stageName + ':\\s*\\{'));
    });
});

test('Daily Orders editor uses searchable modal pickers and an explicit close button', function() {
    var source = fs.readFileSync(new URL('../js/views/dailyOrdersView.js', import.meta.url), 'utf8');
    assert.match(source, /Close without saving/);
    assert.match(source, /Choose customer/);
    assert.match(source, /Choose product to add/);
    assert.match(source, /daily-editor-customer-button/);
    assert.doesNotMatch(source, /id="daily-new-product"/);
    assert.doesNotMatch(source, /id="daily-editor-customer"/);
});

test('Daily Orders reuses session and offline order caches when Firestore is unavailable', function() {
    var controllerSource = fs.readFileSync(new URL('../js/controllers/dailyOrdersController.js', import.meta.url), 'utf8');
    var viewSource = fs.readFileSync(new URL('../js/views/dailyOrdersView.js', import.meta.url), 'utf8');
    assert.match(controllerSource, /getOrdersSnapshot\(\)/);
    assert.match(controllerSource, /sessionDataStore\.loadOrders/);
    assert.match(controllerSource, /readCachedRowsAsync\('orders:all:createdAt_desc'\)/);
    assert.doesNotMatch(controllerSource, /orderService\.getAllOrders\(\)\.catch/);
    assert.match(controllerSource, /import \{ orderService \}/);
    assert.match(controllerSource, /updateOrderFromDailyOrders/);
    assert.match(viewSource, /Orders could not be loaded/);
    assert.match(viewSource, /Showing cached orders/);
});

test('Daily Orders renders product columns and Inventory has a bread default with safe navigation', function() {
    var dailyViewSource = fs.readFileSync(new URL('../js/views/dailyOrdersView.js', import.meta.url), 'utf8');
    var inventoryControllerSource = fs.readFileSync(new URL('../js/controllers/inventoryController.js', import.meta.url), 'utf8');
    var inventoryViewSource = fs.readFileSync(new URL('../js/views/inventoryView.js', import.meta.url), 'utf8');
    var orderServiceSource = fs.readFileSync(new URL('../js/services/orderService.js', import.meta.url), 'utf8');
    var syncServiceSource = fs.readFileSync(new URL('../js/services/syncService.js', import.meta.url), 'utf8');

    assert.match(dailyViewSource, /daily-column-total/);
    assert.match(dailyViewSource, /daily-product-quantity/);
    assert.match(inventoryControllerSource, /getDefaultBreadCategoryIds/);
    assert.match(inventoryViewSource, /Showing bread inventory by default/);
    assert.match(inventoryViewSource, /href="#\/settings"/);
    assert.doesNotMatch(inventoryViewSource, /onclick="router\.navigate/);
    assert.match(orderServiceSource, /enqueue\('updateOrder'/);
    assert.match(syncServiceSource, /actionType === 'updateOrder'/);
});
