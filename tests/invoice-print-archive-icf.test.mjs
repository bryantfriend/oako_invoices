import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import processMarkInvoicePrintedModule from '../js/ICF/Stages/Processors/Invoices/processMarkInvoicePrinted.js';

function readText(path) {
    return fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
}

test('post-print processor confirms draft order and approves draft invoice', async function() {
    const calls = [];
    const result = await processMarkInvoicePrintedModule.processMarkInvoicePrinted({
        payload: { invoiceId: 'invoice-1', orderId: 'order-1' },
        context: {
            invoice: { id: 'invoice-1', orderId: 'order-1', status: 'draft' },
            order: { id: 'order-1', status: 'draft', isPrinted: false },
            printApi: {
                updateOrder: async function(id, patch) { calls.push({ type: 'order', id: id, patch: patch }); },
                updateInvoice: async function(id, patch) { calls.push({ type: 'invoice', id: id, patch: patch }); },
                awardPrintedInvoice: async function() { calls.push({ type: 'award' }); }
            }
        }
    });

    assert.equal(result.ok, true);
    assert.equal(calls[0].patch.status, 'confirmed');
    assert.equal(calls[0].patch.isPrinted, true);
    assert.equal(calls[1].patch.status, 'approved');
    assert.equal(calls[1].patch.isPrinted, true);
    assert.equal(calls[2].type, 'award');
    assert.equal(result.intent.context.markInvoicePrintedResult.invoiceStatus, 'approved');
});

test('post-print processor preserves completed statuses and does not award twice', async function() {
    const calls = [];
    const result = await processMarkInvoicePrintedModule.processMarkInvoicePrinted({
        payload: { invoiceId: 'invoice-2', orderId: 'order-2' },
        context: {
            invoice: { id: 'invoice-2', orderId: 'order-2', status: 'fulfilled' },
            order: { id: 'order-2', status: 'paid', isPrinted: true },
            printApi: {
                updateOrder: async function(id, patch) { calls.push(patch); },
                updateInvoice: async function(id, patch) { calls.push(patch); },
                awardPrintedInvoice: async function() { throw new Error('should not award twice'); }
            }
        }
    });

    assert.equal(result.ok, true);
    assert.equal(calls[0].status, undefined);
    assert.equal(calls[1].status, undefined);
    assert.equal(result.intent.context.markInvoicePrintedResult.invoiceStatus, 'fulfilled');
});

test('printing and archiving are wired through complete ICF flows', function() {
    const printIntent = readText('js/ICF/Intents/MarkInvoicePrintedIntent.js');
    const archiveIntent = readText('js/ICF/Intents/ArchiveInvoiceIntent.js');
    const invoiceView = readText('js/views/invoiceView.js');
    const invoiceController = readText('js/controllers/invoiceController.js');
    const invoiceService = readText('js/services/invoiceService.js');
    const archiveProcessor = readText('js/ICF/Stages/Processors/Invoices/processArchiveInvoice.js');

    ['Validate', 'Normalize', 'AddContext', 'Authorize', 'Process', 'Emit'].forEach(function(stageName) {
        assert.match(printIntent, new RegExp(stageName + ': \{'));
        assert.match(archiveIntent, new RegExp(stageName + ': \{'));
    });
    assert.ok(invoiceView.includes('invoiceController.markPrinted(invoice.id, invoice.orderId, { invoice: invoice })'));
    assert.ok(!invoiceView.includes('orderService.updateOrder(invoice.orderId, orderUpdates)'));
    assert.ok(invoiceController.includes("sessionDataStore.updateInvoiceRecord(invoiceId, invoicePatch, 'mark-invoice-printed')"));
    assert.ok(invoiceController.includes("sessionDataStore.updateOrderRecord(orderId, orderPatch, 'mark-invoice-printed')"));
    assert.ok(invoiceView.includes('invoiceController.archiveInvoice(id)'));
    assert.ok(invoiceController.includes("sessionDataStore.removeInvoiceRecord(invoiceId, 'archive-invoice')"));
    assert.ok(invoiceService.includes('archiveInvoiceIntentModule.createArchiveInvoiceIntent'));
    assert.ok(invoiceService.includes('markInvoicePrintedIntentModule.createMarkInvoicePrintedIntent'));
    assert.match(archiveProcessor, /archived:\s*true/);
    assert.doesNotMatch(archiveProcessor, /status:\s*["']archived["']/);
    assert.match(invoiceService, /where\('archived',\s*'==',\s*true\)/);
});

test('post-print flow reuses trusted records and supports queued offline status updates', function() {
    const contextProvider = readText('js/ICF/Stages/ContextProviders/Invoices/addMarkInvoicePrintedContext.js');
    const invoiceController = readText('js/controllers/invoiceController.js');
    const invoiceService = readText('js/services/invoiceService.js');
    const orderService = readText('js/services/orderService.js');
    const syncService = readText('js/services/syncService.js');

    assert.ok(invoiceController.includes('sessionDataStore.getOrdersSnapshot()'));
    assert.ok(invoiceService.includes('safeContext.invoice'));
    assert.ok(invoiceService.includes('safeContext.order'));
    assert.ok(orderService.includes("enqueue('markOrderPrinted', 'order'"));
    assert.ok(syncService.includes("queueItem.actionType === 'markOrderPrinted'"));
    assert.ok(contextProvider.includes('The invoice was printed, but its status could not be saved yet.'));
});

test('single document reads can attempt the cloud during degraded connectivity', function() {
    const invoiceService = readText('js/services/invoiceService.js');
    const orderService = readText('js/services/orderService.js');

    assert.ok(invoiceService.includes('offlineStatusService.canAttemptCloudRead()'));
    assert.ok(orderService.includes('offlineStatusService.canAttemptCloudRead()'));
    assert.ok(invoiceService.includes('getDocFromCache(docRef)'));
    assert.ok(orderService.includes('getDocFromCache(docRef)'));
});
