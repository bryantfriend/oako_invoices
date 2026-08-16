import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import normalizerModule from '../js/ICF/Stages/Normalizers/Invoices/normalizeQuickPrintSelectedInvoicesPayload.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('Quick Print normalization removes duplicates without changing Orders-list order', () => {
    const intent = {
        payload: {
            orderIds: [' order-3 ', 'order-1', 'order-3', 'order-2'],
            layout: 'two_up_portrait'
        }
    };
    const result = normalizerModule.normalizeQuickPrintSelectedInvoicesPayload(intent);
    assert.equal(result.ok, true);
    assert.deepEqual(result.intent.payload.orderIds, ['order-3', 'order-1', 'order-2']);
    assert.equal(result.intent.payload.layout, 'two-up-portrait');
});

test('Orders Quick Print selection survives rerenders and filters', () => {
    const source = read('js/views/dashboardView.js');
    assert.doesNotMatch(source, /selectedOrderIds\s*=\s*new Set\(\[\.\.\.selectedOrderIds\]\.filter/);
    assert.match(source, /Select all filtered orders/);
    assert.match(source, /const selectableOrders = filteredOrders\.filter/);
    assert.doesNotMatch(source, /isOrderInvoiceSelectionDisabled/);
    assert.match(source, /selectedOrderIds\.add\(id\);\s*updateBulkArchiveControls\(\);/);
    assert.match(source, /getOrderedSelectedOrderIds/);
    assert.match(source, /quickPrintSelectedInvoices\('full'\)/);
    assert.match(source, /quickPrintSelectedInvoices\('two-up-portrait'\)/);
});

test('Orders Quick Print eligibility avoids eager full-invoice loading', () => {
    const dashboardSource = read('js/views/dashboardView.js');
    const sessionSource = read('js/services/sessionDataStore.js');

    assert.match(dashboardSource, /getKnownPrintableInvoiceReferences\(\)/);
    assert.match(dashboardSource, /invoiceService\.getInvoiceByOrderId\(orderId\)/);
    assert.match(dashboardSource, /getOrderedSelectedOrderIds\(true\)/);
    assert.match(dashboardSource, /const printableCount = getOrderedSelectedOrderIds\(true\)\.length/);
    assert.match(dashboardSource, /Quick Print includes only the printable count shown on its button/);
    assert.match(dashboardSource, /orders-printable-check/);
    assert.doesNotMatch(dashboardSource, /getInvoicesByOrderIds\(missingOrderIds\)/);
    assert.doesNotMatch(dashboardSource, /orders-printable-map/);
    assert.equal((dashboardSource.match(/scheduleInvoiceListRefresh\(6000\)/g) || []).length, 1);
    assert.match(sessionSource, /getKnownPrintableInvoiceReferences: function\(\)/);
    assert.match(sessionSource, /invoiceId: invoice\.id/);
});

test('Newly created invoices are immediately available to Orders Quick Print', () => {
    const controllerSource = read('js/controllers/invoiceController.js');
    const sessionSource = read('js/services/sessionDataStore.js');
    const dashboardSource = read('js/views/dashboardView.js');
    const bulkServiceSource = read('js/services/bulkInvoicePrintService.js');

    assert.match(controllerSource, /invoiceService\.preparePrintableInvoice\(orderId, orderSnapshot, options \|\| \{\}\)/);
    assert.doesNotMatch(controllerSource, /await invoiceService\.getInvoice\(invoiceId\)/);
    assert.match(controllerSource, /sessionDataStore\.updateInvoiceRecord\(invoiceId, data\.invoice, 'create-invoice'\)/);
    assert.match(sessionSource, /getKnownInvoiceRecords: function\(\)/);
    assert.match(sessionSource, /state\.loaded = state\.loaded \|\| found \|\| Boolean\(patch\)/);
    assert.match(dashboardSource, /sessionDataStore\.getKnownPrintableInvoiceReferences\(\)/);
    assert.match(dashboardSource, /skipExistingLookup: isRecentNewOrder/);
    assert.match(dashboardSource, /pendingPrintOrderIds/);
    assert.match(bulkServiceSource, /sessionDataStore\.getKnownInvoiceRecords\(\)/);
});

test('single invoice preparation uses the full ICF pipeline and fast dependency path', () => {
    const intentSource = read('js/ICF/Intents/PreparePrintableInvoiceIntent.js');
    const invoiceServiceSource = read('js/services/invoiceService.js');
    const customerServiceSource = read('js/services/customerService.js');

    ['Validate', 'Normalize', 'AddContext', 'Authorize', 'Process', 'Emit'].forEach((stageName) => {
        assert.match(intentSource, new RegExp(stageName + ': \\{'));
    });
    assert.match(invoiceServiceSource, /intentId: 'invoice-for-order-' \+ orderId/);
    assert.match(invoiceServiceSource, /returnInvoiceSnapshot: true/);
    assert.match(invoiceServiceSource, /deferNonCriticalWork: true/);
    assert.match(invoiceServiceSource, /getCustomerByNameCached/);
    assert.match(customerServiceSource, /readCachedRowsAsync\('customers:all'\)/);
});

test('single-order print shows accessible indeterminate progress until the invoice preview renders', function() {
    const dashboardSource = read('js/views/dashboardView.js');
    const customerDetailSource = read('js/views/customerDetailView.js');
    const invoiceViewSource = read('js/views/invoiceView.js');
    const progressSource = read('js/components/invoicePreparationProgress.js');
    const stylesSource = read('css/styles.css');

    assert.match(dashboardSource, /startInvoicePreparationProgress\(\)/);
    assert.match(dashboardSource, /if \(!invoiceNavigationStarted\) \{\s*stopInvoicePreparationProgress\(\)/);
    assert.match(customerDetailSource, /pendingPrintOrderIds\.has\(id\)/);
    assert.match(customerDetailSource, /invoices\.find\(function\(invoice\)/);
    assert.match(invoiceViewSource, /refreshBody\(\);\s*finishInvoicePreparationProgress\(\);/);
    assert.match(progressSource, /role=\"progressbar\"/);
    assert.match(progressSource, /aria-valuetext=\"Working\"/);
    assert.match(progressSource, /closeOnEsc: true/);
    assert.match(stylesSource, /@keyframes order-print-progress-sweep/);
    assert.match(stylesSource, /prefers-reduced-motion: reduce/);
});

test('Recent Orders defaults to Active and successful archives remain in Active view', function() {
    const dashboardSource = read('js/views/dashboardView.js');

    assert.match(dashboardSource, /let archivedFilter = 'active';/);
    assert.doesNotMatch(dashboardSource, /archivedFilter = showArchivedAnalytics \? 'all' : 'active';/);
    assert.match(dashboardSource, /if \(mode === 'archive' && transitionedCount > 0\) \{\s*archivedFilter = 'active';/);
    assert.match(dashboardSource, /filterRecordsByArchivedMode\(allOrders, archivedFilter\)/);
    assert.match(dashboardSource, /markOrderArchivedLocally\(id, result\);/);
    assert.match(dashboardSource, /selectedOrderIds\.delete\(id\);\s*activeOrders = getActiveOrders\(allOrders\);\s*archivedFilter = 'active';\s*renderUI\(\);/);
});

test('bulk archive UI tracks confirmed completion and keeps failed selections retryable', () => {
    const dashboardSource = read('js/views/dashboardView.js');
    const orderServiceSource = read('js/services/orderService.js');
    const intentSource = read('js/ICF/Intents/ArchiveSelectedOrdersIntent.js');

    assert.match(dashboardSource, /id="bulk-archive-progress-bar"/);
    assert.match(dashboardSource, /transition:width 600ms ease/);
    assert.match(dashboardSource, /markOrderArchivedLocally\(progress\.orderId, progress\.result\)/);
    assert.match(dashboardSource, /selectedOrderIds\.delete\(progress\.orderId\)/);
    assert.match(dashboardSource, /remaining orders stay selected so you can retry/);
    assert.match(orderServiceSource, /createArchiveSelectedOrdersIntent/);
    ['Validate', 'Normalize', 'AddContext', 'Authorize', 'Process', 'Emit'].forEach((stageName) => {
        assert.match(intentSource, new RegExp(stageName + ': \\{'));
    });
});

test('Bulk PDF service uses one PDF, sequential rendering, and odd 2-up blank half handling', () => {
    const source = read('js/services/bulkInvoicePrintService.js');
    assert.match(source, /var pdf = createPdf/);
    assert.match(source, /while \(invoiceIndex < invoices\.length\)/);
    assert.match(source, /if \(layout === 'two-up-portrait' && pendingHalf\)/);
    assert.match(source, /addTwoUpSheet\(pdf, pendingHalf, null, hasPdfPage\)/);
    assert.match(source, /previewWindow\.location\.replace\(blobUrl\)/);
    assert.doesNotMatch(source, /router\.navigate|window\.print\(/);
    assert.doesNotMatch(source, /indexedDB|openOfflineDexieDatabase|localStorage/);
});

test('Invoice QR payload and renderer are invoice-number-specific data URLs', () => {
    const qrSource = read('js/services/qrService.js');
    const templateSource = read('js/services/invoicePrintTemplate.js');
    const settingsSource = read('js/services/settingsService.js');
    assert.match(qrSource, /invoiceNumber: String\(invoice\.invoiceNumber \|\| ''\)/);
    assert.match(qrSource, /QRCode\.toDataURL/);
    assert.match(qrSource, /invoiceNumberMatches\(invoice, payload\.invoiceNumber\)/);
    assert.match(templateSource, /invoice-qr-image/);
    assert.match(templateSource, /is missing its prepared QR image/);
    assert.match(templateSource, /settings\.paymentQrImageUrl \|\| DEFAULT_PAYMENT_QR_IMAGE_URL/);
    assert.match(templateSource, /alt="Payment QR"/);
    assert.match(settingsSource, /paymentQrImageUrl: '\.\/Payment QR Code\.png'/);
});

test('Invoice print uses the bundled payment QR at the bottom when saved settings are empty', async function() {
    const previousLocalStorage = globalThis.localStorage;
    globalThis.localStorage = {
        getItem: function() {
            return null;
        }
    };
    const templateModule = await import('../js/services/invoicePrintTemplate.js');
    const pages = templateModule.buildInvoicePrintPages({
        invoice: {
            id: 'invoice-1',
            invoiceNumber: 'INV-1',
            invoiceQrDataUrl: 'data:image/png;base64,aW52b2ljZQ==',
            items: [],
            totalAmount: 0,
            createdAt: '2026-07-29T00:00:00.000Z'
        },
        settings: {
            paymentQrImageUrl: '',
            showQrCode: true,
            showFooter: true
        },
        language: 'en',
        currentPage: 1,
        scale: 1,
        showAllPages: true
    });

    assert.equal(pages.length, 1);
    assert.match(pages[0], /border-top:[\s\S]*src="\.\/Payment QR Code\.png" alt="Payment QR"/);
    if (previousLocalStorage === undefined) {
        delete globalThis.localStorage;
    } else {
        globalThis.localStorage = previousLocalStorage;
    }
});

test('Quick Print intent registers every required ICF stage', () => {
    const source = read('js/ICF/Intents/QuickPrintSelectedInvoicesIntent.js');
    ['Validate', 'Normalize', 'AddContext', 'Authorize', 'Process', 'Emit'].forEach((stageName) => {
        assert.match(source, new RegExp(stageName + ': \\{'));
    });
});
