import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

function readText(path) {
    return fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
}

test('core Firestore rules deny document deletes', function() {
    var rules = readText('firebase/firestore.rules');

    assert.doesNotMatch(rules, /allow\s+delete:\s+if\s+isAdmin\(\)/);
    assert.doesNotMatch(rules, /allow\s+create,\s*delete:/);
    assert.doesNotMatch(rules, /allow\s+update,\s*delete:\s+if\s+isAdmin\(\)/);
    assert.doesNotMatch(rules, /allow\s+read,\s*update,\s*delete:\s+if\s+isAdmin\(\)/);
    assert.doesNotMatch(rules, /allow\s+create,\s*update,\s*delete:\s+if\s+isAdmin\(\)/);
    assert.doesNotMatch(rules, /allow\s+read,\s*create,\s*update,\s*delete:\s+if\s+isAdmin\(\)/);
});

test('order and customer deletion paths archive instead of deleting Firestore documents', function() {
    var orderService = readText('js/services/orderService.js');
    var customerService = readText('js/services/customerService.js');
    var invoiceService = readText('js/services/invoiceService.js');

    assert.doesNotMatch(orderService, /deleteDoc/);
    assert.doesNotMatch(customerService, /deleteDoc/);
    assert.match(orderService, /async\s+deleteOrder\(id\)\s*{[\s\S]*return\s+this\.archiveOrder\(id\);/);
    assert.match(customerService, /async\s+deleteCustomer\(id\)\s*{[\s\S]*archived:\s*true/);
    assert.match(invoiceService, /async\s+deleteInvoice\(id\)\s*{[\s\S]*return\s+this\.archiveInvoice\(id\);/);
});

test('customer and draft order UI no longer describes permanent deletion', function() {
    var customerView = readText('js/views/customerView.js');
    var dashboardView = readText('js/views/dashboardView.js');
    var translations = readText('js/core/i18n.js');

    assert.doesNotMatch(customerView, /Delete Permanently|permanently remove/i);
    assert.doesNotMatch(dashboardView, /Delete Draft|permanently remove/i);
    assert.doesNotMatch(translations, /permanently remove/i);
});
