import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import path from 'node:path';
import { build } from 'esbuild';

var bundle = await build({
    entryPoints: ['js/controllers/dashboardController.js'], bundle: true, write: false, format: 'cjs', platform: 'node',
    plugins: [{ name: 'controller-boundaries', setup: function(api) {
        api.onResolve({ filter: /./ }, function(args) {
            if (args.kind !== 'entry-point') return { path: args.path, external: true };
        });
    } }]
});

function harness(emptyCatalog) {
    var orders = [{ id: 'sale', status: 'confirmed', totalAmount: 120 }];
    var module = { exports: {} };
    var dependencies = {
        sessionDataStore: {
            loadOrders: async function() { return { records: orders, extras: { returnInvoices: [{ id: 'return' }] } }; },
            refreshOrders: async function() { return { records: orders }; }
        },
        productReconciliationService: { productReconciliationService: {
            loadContext: async function() { if (emptyCatalog) return { products: [] }; throw new Error('unavailable'); },
            projectRecords: function() { throw new Error('Do not reconcile against an unavailable catalog'); }
        } },
        orderRecordHelpers: { getAnalyticsStatus: function(order) { return order.status; } },
        notificationService: { notificationService: { error: function() {} } },
        i18n: { t: function(key) { return key; } }
    };
    vm.runInNewContext(bundle.outputFiles[0].text, {
        module: module, exports: module.exports,
        console: { warn: function() {}, error: function() {} },
        require: function(specifier) { return dependencies[path.basename(specifier, '.js')] || {}; }
    });
    return module.exports.dashboardController;
}

test('Orders and monetary statistics survive failed historical match reads on load and refresh', async function() {
    var api = harness(false);
    var loaded = await api.loadDashboard();
    assert.equal(loaded.orders.length, 1);
    assert.equal(loaded.returnInvoices.length, 1);
    assert.equal(loaded.metrics.totalConfirmedAmount, 120);
    assert.equal(loaded.meta.reconciliationUnavailable, true);
    var refreshed = await api.refreshDashboard();
    assert.equal(refreshed.orders.length, 1);
    assert.equal(refreshed.metrics.totalConfirmedAmount, 120);
});

test('an unavailable product catalog does not erase historical Orders statistics', async function() {
    var result = await harness(true).loadDashboard();
    assert.equal(result.orders.length, 1);
    assert.equal(result.metrics.totalConfirmedAmount, 120);
});
