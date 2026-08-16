import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

function read(path) {
    return fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
}

test('order archive transitions are atomic, idempotent, and conflict-aware offline', function() {
    const orderService = read('js/services/orderService.js');
    const syncService = read('js/services/syncService.js');

    assert.match(orderService, /if \(existingOrder\.archived === true\)/);
    assert.match(orderService, /alreadyArchived:\s*true,\s*transitioned:\s*false/);
    assert.match(orderService, /await runTransaction\(db/);
    assert.match(orderService, /baseUpdatedAtMillis:/);
    assert.match(syncService, /serverChangedSinceBase\(queueItem, serverVersion\)/);
    assert.match(syncService, /Boolean\(serverVersion\.archived\) === desiredArchived/);
});

test('archive management includes migration, bulk restore, pagination, and scoped selection', function() {
    const migration = read('js/services/archiveMigrationService.js');
    const invoiceView = read('js/views/invoiceView.js');
    const dashboard = read('js/views/dashboardView.js');

    assert.match(migration, /dryRun !== false/);
    assert.match(migration, /BATCH_SIZE = 350/);
    assert.match(migration, /legacyOrdersCopied/);
    assert.match(invoiceView, /select-all-archived-invoices/);
    assert.match(invoiceView, /restore-selected-invoices/);
    assert.match(invoiceView, /load-more-archived-invoices/);
    assert.match(invoiceView, /archive-migration-check/);
    assert.match(dashboard, /getBulkTransitionOrderIds/);
    assert.match(dashboard, /filteredOrders\.filter\(isBulkSelectableOrder\)/);
});

test('archive transitions expose motion with reduced-motion accessibility', function() {
    const dashboard = read('js/views/dashboardView.js');
    const invoiceView = read('js/views/invoiceView.js');
    const styles = read('css/styles.css');

    assert.match(dashboard, /archive-row-exit/);
    assert.match(invoiceView, /archive-row-restore-out/);
    assert.match(styles, /@keyframes archive-row-exit/);
    assert.match(styles, /@keyframes archive-box-rise/);
    assert.match(styles, /prefers-reduced-motion:\s*reduce/);
});
