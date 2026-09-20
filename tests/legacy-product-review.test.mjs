import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { findProductCategory } from '../js/core/productCategories.js';

var component = fs.readFileSync(new URL('../js/components/productReconciliationModal.js', import.meta.url), 'utf8');
var componentScript = component.replace(/^import .*\r?\n/gm, '').replace(/^export .*$/gm, '');

test('legacy review on working pages is a passive link and never opens a dialog', function() {
    var appended = [];
    var removed = false;
    var oldNotice = { remove: function() { removed = true; } };
    var context = vm.createContext({
        productReconciliationService: { getPendingMatches: function() { return [{ key: 'legacy' }]; } },
        getCurrentNavigationId: function() { return 1; },
        isNavigationStillCurrent: function() { return true; },
        ROUTES: { LEGACY_PRODUCTS: '/legacy-products' },
        document: { createElement: function(tag) { assert.equal(tag, 'aside'); return { setAttribute: function() {} }; } },
        Modal: function() { assert.fail('Review must never open a modal'); }
    });
    vm.runInContext(componentScript, context);
    var container = {
        querySelector: function() { return oldNotice; },
        appendChild: function(element) { appended.push(element); },
        prepend: function() { assert.fail('Do not place a blocking notice ahead of the work'); }
    };
    assert.equal(context.mountProductReconciliation(container, function() { assert.fail('Do not reload automatically'); }, 'orders'), true);
    assert.equal(removed, true);
    assert.equal(appended.length, 1);
    assert.match(appended[0].innerHTML, /href="#\/legacy-products"/);
    assert.match(appended[0].innerHTML, /Review when convenient/);
    context.productReconciliationService.getPendingMatches = function() { return []; };
    assert.equal(context.mountProductReconciliation(container, function() {}, 'orders'), false);
    assert.equal(appended.length, 1);
});

test('review rows offer category-free deletion, escaped historical names, and restoration', function() {
    var source = fs.readFileSync(new URL('../js/views/legacyProductsView.js', import.meta.url), 'utf8');
    var context = vm.createContext({ findProductCategory: findProductCategory });
    vm.runInContext(source.slice(source.indexOf('function escapeHtml('), source.indexOf('async function renderLegacyProducts(')), context);
    var entry = { key: 'old', source: { name: '<Old bread>', productId: 'old-id' } };
    var catalog = { products: [], categories: [] };
    var pending = context.renderReviewEntry(entry, false, catalog);
    assert.match(pending, /&lt;Old bread&gt;/);
    assert.doesNotMatch(pending, /<Old bread>/);
    assert.match(pending, /data-review-action="delete">Delete — no longer available/);
    assert.match(pending, /<details[^>]*><summary>Match product<\/summary>/);
    assert.doesNotMatch(pending, /role="dialog"|checked/);
    var deleted = context.renderReviewEntry(entry, true, catalog);
    assert.match(deleted, /data-review-action="restore">Restore to review/);
    assert.doesNotMatch(deleted, /data-review-action="delete"|<form/);
});
