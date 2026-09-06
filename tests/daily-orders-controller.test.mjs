import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { build } from 'esbuild';

// Exercise the real controller and all six ICF stages without connecting to Firebase.
var root = fileURLToPath(new URL('../', import.meta.url));
var bundle = await build({
    absWorkingDir: root,
    entryPoints: ['js/controllers/dailyOrdersController.js'],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    plugins: [{
        name: 'daily-order-service-boundaries',
        setup: function(buildApi) {
            buildApi.onResolve({
                filter: /\/services\/|\/core\/(authService|store|notificationService|firebase|firestoreRead|i18n)\.js$|^https:/
            }, function(args) {
                return { path: args.path, external: true };
            });
        }
    }]
});

function loadController(orderService, user) {
    var cached = [];
    var messages = [];
    var services = {
        authService: { getCurrentUser: function() { return user; } },
        store: { getState: function() { return { adminProfile: { role: 'admin' } }; } },
        orderService: orderService,
        sessionDataStore: {
            updateOrderRecord: function(id, order, source) {
                cached.push({ id: id, order: order, source: source });
            }
        },
        notificationService: {
            success: function(message) { messages.push(message); }
        }
    };
    var module = { exports: {} };
    vm.runInNewContext(bundle.outputFiles[0].text, {
        module: module,
        exports: module.exports,
        console: { info: function() {}, warn: function() {} },
        require: function(specifier) {
            var name = path.basename(specifier, '.js');
            var service = services[name] || {};
            return Object.assign({ [name]: service }, service);
        }
    });
    return {
        controller: module.exports.dailyOrdersController,
        cached: cached,
        messages: messages
    };
}

function makeDraft() {
    return {
        customerId: 'customer-1',
        customerName: ' Cafe ',
        orderDate: '2026-09-06',
        notes: ' Morning delivery ',
        selectedPriceMode: 'retail',
        items: [{ productId: 'loaf', name: 'Country loaf', quantity: 2, unitPrice: 100, price: 100 }]
    };
}

test('Daily Orders saves a new order through the imported service and returns the printable record', async function() {
    var calls = [];
    var orderService = {
        createOrder: async function(order, userId) {
            assert.equal(this, orderService);
            calls.push({ order: order, userId: userId });
            return 'new-order';
        }
    };
    var harness = loadController(orderService, { uid: 'admin-1' });
    var saved = await harness.controller.saveOrder(makeDraft());

    assert.equal(calls.length, 1);
    assert.equal(calls[0].userId, 'admin-1');
    assert.equal(calls[0].order.customerName, 'Cafe');
    assert.equal(calls[0].order.totalAmount, 200);
    assert.equal(saved.id, 'new-order');
    assert.equal(saved.orderDate, '2026-09-06');
    assert.equal(saved.notes, 'Morning delivery');
    assert.equal(saved.items[0].quantity, 2);
    assert.equal(harness.cached.length, 1);
    assert.equal(harness.cached[0].order, saved);
    assert.deepEqual(harness.messages, ['Daily order created.']);
});

test('Daily Orders updates an existing order through its daily-order service method', async function() {
    var draft = Object.assign(makeDraft(), { orderId: 'existing-order', status: 'confirmed' });
    var calls = [];
    var orderService = {
        updateOrderFromDailyOrders: async function(id, order, trustedOrder) {
            assert.equal(this, orderService);
            calls.push({ id: id, order: order, trustedOrder: trustedOrder });
        }
    };
    var harness = loadController(orderService, { uid: 'admin-1' });
    var saved = await harness.controller.saveOrder(draft);

    assert.equal(calls.length, 1);
    assert.equal(calls[0].id, 'existing-order');
    assert.equal(calls[0].trustedOrder, draft);
    assert.equal(saved.id, 'existing-order');
    assert.equal(saved.status, 'confirmed');
    assert.equal(harness.cached[0].id, saved.id);
    assert.deepEqual(harness.messages, ['Daily order updated.']);
});

test('Daily Orders reports a failed save without returning or caching a printable order', async function() {
    var harness = loadController({
        createOrder: async function() { throw new Error('Order could not be stored.'); }
    }, { uid: 'admin-1' });

    await assert.rejects(harness.controller.saveOrder(makeDraft()), /Order could not be stored/);
    assert.equal(harness.cached.length, 0);
    assert.equal(harness.messages.length, 0);
});
