import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModule } from './helpers/load-isolated-module.mjs';

test('offline invoice lookups use durable snapshots without starting cloud reads', async function() {
    var invoice = { id: 'offline-invoice', orderId: 'order-1', items: [], invoiceNumber: 'OFF-1' };
    var service = (await loadModule('js/services/invoiceService.js', {
        offlineQueueService: { offlineQueueService: { getLocalInvoiceSnapshots: async function() { return { 'offline-invoice': invoice }; } } },
        archiveRecordHelpers: { normalizeArchivedRecord: function(record) { return record; } },
        firestoreRead: { getDocsWithCache: function() { assert.fail('Must not query cloud for a local invoice'); } }
    })).invoiceService;
    assert.equal((await service.getInvoicesByOrderIds(['order-1']))[0].id, invoice.id);
    assert.equal((await service.getInvoiceByOrderId('order-1')).id, invoice.id);
});

test('Quick Print waits for confirmation and retries only unsuccessful printed-status updates', async function() {
    var options;
    var calls = [];
    var failSecond = true;
    var module = await loadModule('js/components/quickPrintConfirmation.js', {
        modal: { Modal: class { constructor(value) { options = value; } open() {} } },
        i18n: { t: function(key) { return key; } },
        notificationService: { notificationService: { error() {}, success() {} } },
        invoiceController: { invoiceController: { markPrinted: async function(id) {
            calls.push(id);
            return id === 'second' && failSecond ? null : {};
        } } }
    });
    module.showQuickPrintConfirmation({
        includedInvoices: [{ id: 'first', orderId: 'one' }, { id: 'second', orderId: 'two' }],
        failedInvoices: ['<failed invoice>']
    });
    assert.deepEqual(calls, []);
    assert.equal(options.cancelText, 'btn_skip');
    assert.match(options.content, /&lt;failed invoice&gt;/);
    assert.equal(await options.onConfirm(), false);
    assert.deepEqual(calls, ['first', 'second']);
    failSecond = false;
    assert.equal(await options.onConfirm(), true);
    assert.deepEqual(calls, ['first', 'second', 'second']);
});

test('mixed invoice lookup queries only missing orders and preserves selection order', async function() {
    var queriedIds;
    var service = (await loadModule('js/services/invoiceService.js', {
        offlineQueueService: { offlineQueueService: { getLocalInvoiceSnapshots: async function() {
            return { local: { id: 'local', orderId: 'saved' } };
        } } },
        archiveRecordHelpers: { normalizeArchivedRecord: function(record) { return record; } },
        'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js': {
            collection: function() {}, query: function() {},
            where: function(field, operator, ids) { queriedIds = ids; }
        },
        firestoreRead: { getDocsWithCache: async function() {
            return [{ id: 'remote', orderId: 'missing' }];
        } }
    })).invoiceService;
    var result = await service.getInvoicesByOrderIds(['missing', 'saved', 'missing']);
    assert.deepEqual(Array.from(queriedIds), ['missing']);
    assert.deepEqual(Array.from(result, function(record) { return record.id; }), ['remote', 'local']);
});

test('Quick Print settings use saved settings without a cloud read', async function() {
    var service = (await loadModule('js/services/settingsService.js', {
        'https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js': { getStorage: function() {} },
        firestoreRead: { readCachedRowsAsync: async function() { return [{ companyName: 'Saved bakery' }]; } },
        offlineStatusService: { offlineStatusService: { isOnline: function() { assert.fail('Saved print settings must not wait for cloud'); } } }
    }, { localStorage: { getItem: function() { return null; } } })).settingsService;
    assert.equal((await service.getInvoiceSettings({ preferCachedDependencies: true })).companyName, 'Saved bakery');
});
