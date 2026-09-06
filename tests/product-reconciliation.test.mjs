import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { reconcileProductRecords, getProductMatchKey, getCategoryProducts, getCurrentProductName } from '../js/core/productReconciliation.js';
import { buildInventoryOrderTotals, getInventoryProductQuantities } from '../js/core/inventoryQuantities.js';
import { statsService } from '../js/services/statsService.js';

var categories = [{ id: 'bread', name: 'Bread' }, { id: 'cookies', name: 'Cookies' }];
var products = [
    { id: 'new-bread', name: 'Current bread', categoryId: 'bread' },
    { id: 'other-bread', name: 'Other bread', categoryId: 'bread' },
    { id: 'cookie', name: 'Current cookie', categoryId: 'cookies' }
];
var historical = [{ id: 'order', status: 'draft', orderDate: '2026-09-06', totalAmount: 140, items: [
    { productId: 'old-bread', name: 'Old bread', categoryName: 'Bread', quantity: 3, price: 20, returnedQuantity: 1 },
    { productId: 'new-bread', name: 'Current bread', categoryId: 'bread', quantity: '4', price: 20 }
] }];

function context(mappings, currentProducts) { return { products: currentProducts || products, categories: categories, mappings: mappings || {} }; }
function matchedContext() {
    var pending = reconcileProductRecords(historical, context()).issues[0];
    var mappings = {};
    mappings[pending.key] = { productId: 'new-bread', categoryId: 'bread' };
    return context(mappings);
}

test('old names require a match and cannot silently affect a current product total', function() {
    var result = reconcileProductRecords(historical, context());
    assert.equal(result.issues.length, 1);
    assert.equal(result.issues[0].source.name, 'Old bread');
    assert.equal(result.records[0].items[0].name, 'Product match needed');
    var totals = buildInventoryOrderTotals(result.records, '2026-09-06');
    assert.equal(totals['new-bread'].ordered, 4);
    assert.equal(totals['old-bread'], undefined);
    assert.deepEqual(getCategoryProducts(products, categories, 'bread').map(function(product) { return product.id; }), ['new-bread', 'other-bread']);
});

test('confirmation combines old and new quantities under current IDs and names, preserving returns and money', function() {
    var before = JSON.stringify(historical);
    var result = reconcileProductRecords(historical, matchedContext());
    assert.equal(result.issues.length, 0);
    assert.equal(result.records[0].items[0].productId, 'new-bread');
    assert.equal(result.records[0].items[0].name, 'Current bread');
    assert.equal(result.records[0].totalAmount, 140);
    assert.equal(result.records[0].items[0].price, 20);
    var totals = buildInventoryOrderTotals(result.records, '2026-09-06');
    assert.equal(getInventoryProductQuantities({ totalBaked: 20 }, totals['new-bread']).left, 14);
    assert.deepEqual(statsService._getTopProducts(result.records).data, [7]);
    assert.deepEqual(statsService._getTopProducts(result.records).fullLabels, ['Current bread']);
    assert.equal(JSON.stringify(historical), before, 'Historical records are not rewritten');
});

test('an old name still prompts when its product ID remains active', function() {
    var records = [{ items: [{ productId: 'new-bread', name: 'Former name', categoryId: 'bread', quantity: 1 }] }];
    assert.equal(reconcileProductRecords(records, context()).issues.length, 1);
});

test('return history inherits the matched current identity from its order line', function() {
    var record = structuredClone(historical[0]);
    record.courierReturns = [{ items: [{ productId: 'old-bread', quantity: 1, returnAmount: 20 }] }];
    var result = reconcileProductRecords([record], matchedContext());
    assert.equal(result.records[0].courierReturns[0].items[0].name, 'Current bread');
    assert.equal(result.records[0].courierReturns[0].items[0].productId, 'new-bread');
    assert.equal(result.records[0].courierReturns[0].items[0].returnAmount, 20);
    assert.equal(result.issues.length, 0);
});

test('a later website rename updates confirmed labels without changing the saved mapping', function() {
    var catalog = matchedContext();
    var once = reconcileProductRecords(historical, catalog);
    catalog.products = products.map(function(product) { return Object.assign({}, product, product.id === 'new-bread' ? { name: 'Latest bread' } : {}); });
    var again = reconcileProductRecords(once.records, catalog);
    assert.equal(again.records[0].items[0].name, 'Latest bread');
    assert.equal(again.records[0].items[0].productId, 'new-bread');
});

test('same historical name in different categories or IDs remains separate', function() {
    assert.notEqual(getProductMatchKey({ name: 'Old', categoryId: 'bread' }), getProductMatchKey({ name: 'Old', categoryId: 'cookies' }));
    assert.notEqual(getProductMatchKey({ name: 'Old', productId: 'a' }), getProductMatchKey({ name: 'Old', productId: 'b' }));
});

test('current catalog translations resolve and Russian-only products have a current name', function() {
    var product = { id: 'ru', name_ru: 'Ассорти бискотти', categoryId: 'cookies' };
    assert.equal(getCurrentProductName(product), 'Ассорти бискотти');
    var result = reconcileProductRecords([{ items: [{ productId: 'ru', name: product.name_ru, quantity: 1 }] }], context({}, [product]));
    assert.equal(result.issues.length, 0);
    assert.equal(result.records[0].items[0].name, product.name_ru);
});

test('ambiguous exact names and retired mapping targets require a new confirmation', function() {
    var duplicates = products.concat({ id: 'duplicate', name: 'Current bread', categoryId: 'bread' });
    var result = reconcileProductRecords([{ items: [{ name: 'Current bread', categoryId: 'bread', quantity: 2 }] }], context({}, duplicates));
    assert.equal(result.issues.length, 1);
    var catalog = matchedContext();
    catalog.products = products.filter(function(product) { return product.id !== 'new-bread'; });
    assert.equal(reconcileProductRecords(historical, catalog).issues.length, 2);
});

test('different current products with the same name stay separate in product totals', function() {
    var result = statsService._getTopProducts([{ items: [{ productId: 'a', name: 'Same', quantity: 2 }, { productId: 'b', name: 'Same', quantity: 3 }] }]);
    assert.equal(result.ids.length, 2);
    assert.deepEqual(result.data, [3, 2]);
});

test('confirmed historical quantities combine correctly for every product in a 41-product catalog', function() {
    var catalogProducts = Array.from({ length: 41 }, function(value, index) { return { id: 'current-' + index, name: 'Current ' + index, categoryId: index < 11 ? 'bread' : 'cookies' }; });
    var records = [{ orderDate: '2026-09-06', status: 'draft', items: [] }];
    catalogProducts.forEach(function(product, index) {
        records[0].items.push({ productId: 'old-' + index, name: 'Former ' + index, categoryId: product.categoryId, quantity: '3' });
        records[0].items.push({ productId: product.id, name: product.name, categoryId: product.categoryId, quantity: 2 });
    });
    var catalog = context({}, catalogProducts);
    var pending = reconcileProductRecords(records, catalog);
    assert.equal(pending.issues.length, 41);
    pending.issues.forEach(function(issue) { catalog.mappings[issue.key] = { productId: issue.source.productId.replace('old-', 'current-'), categoryId: issue.source.categoryId }; });
    var resolved = reconcileProductRecords(pending.records, catalog);
    assert.equal(resolved.issues.length, 0);
    var totals = buildInventoryOrderTotals(resolved.records, '2026-09-06');
    catalogProducts.forEach(function(product) {
        assert.equal(totals[product.id].ordered, 5, product.id);
        assert.equal(getInventoryProductQuantities({ totalBaked: 20 }, totals[product.id]).left, 15, product.id);
    });
});

var root = fileURLToPath(new URL('../', import.meta.url));
var bundle = await build({
    entryPoints: [path.join(root, 'js/services/productReconciliationService.js')],
    bundle: true, write: false, format: 'cjs', platform: 'node',
    plugins: [{ name: 'mapping-boundaries', setup: function(api) {
        api.onResolve({ filter: /\/services\/|\/(productService|offlineStatusService|firebase)\.js$|\/core\/(authService|notificationService|i18n|store|firestoreRead)\.js$|^https:/ }, function(args) {
            if (args.kind === 'entry-point') return;
            return { path: args.path, external: true };
        });
    } }]
});

function serviceHarness(server) {
    var state = { role: 'admin', online: true, reject: false, writes: 0, cached: [] };
    var module = { exports: {} };
    var dependencies = {
        firebase: { db: {}, auth: { currentUser: { uid: 'staff' } } },
        store: { store: { getState: function() { return { adminProfile: { role: state.role } }; } } },
        offlineStatusService: { offlineStatusService: { canAttemptCloudRead: function() { return state.online; } } },
        productService: { productService: { getAllProducts: async function() { return products; }, getAllCategories: async function() { return categories; } } },
        firestoreRead: {
            getDocsWithCache: async function() { return [{ mappings: structuredClone(server.mappings) }]; },
            writeCachedRows: function(key, rows) { state.cached = rows; }
        }
    };
    vm.runInNewContext(bundle.outputFiles[0].text, {
        module: module, exports: module.exports,
        console: { info: function() {}, warn: function() {}, error: function() {} },
        require: function(specifier) {
            if (specifier.startsWith('https:')) return {
                collection: function() {}, query: function() {}, where: function() {}, documentId: function() {}, doc: function() {},
                runTransaction: async function(db, callback) {
                    if (state.reject) throw new Error('permission-denied');
                    await callback({ get: async function() { return { exists: function() { return true; }, data: function() { return server; } }; },
                        set: function(reference, patch) { Object.assign(server.mappings, patch.mappings); state.writes += 1; }
                    });
                }
            };
            return dependencies[path.basename(specifier, '.js')] || {};
        }
    });
    return { api: module.exports.productReconciliationService, state: state };
}

test('confirmed matches persist across fresh sessions and repeated confirmation is safe', async function() {
    var server = { mappings: {} };
    var harness = serviceHarness(server);
    await harness.api.loadContext();
    harness.api.projectRecords(historical);
    var issue = harness.api.getPendingMatches()[0];
    await harness.api.confirmMatch(issue, 'new-bread', 'bread');
    await harness.api.confirmMatch(issue, 'new-bread', 'bread');
    assert.equal(Object.keys(server.mappings).length, 1);
    var next = serviceHarness(server);
    await next.api.loadContext();
    assert.equal(next.api.projectRecords(historical)[0].items[0].productId, 'new-bread');
    assert.equal(next.api.getPendingMatches().length, 0);
});

test('matching rejects other categories, unauthorized users, unavailable products and offline saves', async function() {
    var server = { mappings: {} };
    var harness = serviceHarness(server);
    await harness.api.loadContext();
    harness.api.projectRecords(historical);
    var issue = harness.api.getPendingMatches()[0];
    await assert.rejects(harness.api.confirmMatch(issue, 'cookie', 'bread'));
    await assert.rejects(harness.api.confirmMatch(issue, 'cookie', 'cookies'));
    await assert.rejects(harness.api.confirmMatch(issue, 'missing-product', 'bread'));
    harness.state.role = 'viewer';
    await assert.rejects(harness.api.confirmMatch(issue, 'new-bread', 'bread'));
    harness.state.role = 'admin'; harness.state.online = false;
    await assert.rejects(harness.api.confirmMatch(issue, 'new-bread', 'bread'));
    assert.equal(harness.state.writes, 0);
    assert.equal(harness.api.getPendingMatches().length, 1);
});

test('failed and conflicting writes leave the previous match intact', async function() {
    var server = { mappings: {} };
    var harness = serviceHarness(server);
    await harness.api.loadContext();
    harness.api.projectRecords(historical);
    var issue = harness.api.getPendingMatches()[0];
    harness.state.reject = true;
    await assert.rejects(harness.api.confirmMatch(issue, 'new-bread', 'bread'));
    assert.equal(harness.api.getPendingMatches().length, 1);
    assert.equal(harness.state.cached.length, 0);
    harness.state.reject = false;
    await harness.api.confirmMatch(issue, 'new-bread', 'bread');
    await assert.rejects(harness.api.confirmMatch(issue, 'other-bread', 'bread'));
    assert.equal(server.mappings[issue.key].productId, 'new-bread');
});

test('an item with no historical category can be matched after choosing a current category', async function() {
    var harness = serviceHarness({ mappings: {} });
    await harness.api.loadContext();
    var records = [{ items: [{ productId: 'unknown-old', name: 'Former product', quantity: 2 }] }];
    harness.api.projectRecords(records);
    var issue = harness.api.getPendingMatches()[0];
    assert.equal(issue.source.categoryId, '');
    await harness.api.confirmMatch(issue, 'cookie', 'cookies');
    assert.equal(harness.api.projectRecords(records)[0].items[0].name, 'Current cookie');
});
