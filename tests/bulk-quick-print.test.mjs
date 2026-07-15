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
    assert.match(source, /Select all shown printable invoices/);
    assert.match(source, /No printable invoice has been created\./);
    assert.match(source, /getOrderedSelectedOrderIds/);
    assert.match(source, /quickPrintSelectedInvoices\('full'\)/);
    assert.match(source, /quickPrintSelectedInvoices\('two-up-portrait'\)/);
});

test('Bulk PDF service uses one PDF, sequential rendering, and odd 2-up blank half handling', () => {
    const source = read('js/services/bulkInvoicePrintService.js');
    assert.match(source, /var pdf = createPdf/);
    assert.match(source, /while \(invoiceIndex < invoices\.length\)/);
    assert.match(source, /if \(layout === 'two-up-portrait' && pendingHalf\)/);
    assert.match(source, /addTwoUpSheet\(pdf, pendingHalf, null, hasPdfPage\)/);
    assert.match(source, /previewWindow\.location\.replace\(blobUrl\)/);
    assert.doesNotMatch(source, /router\.navigate|window\.print\(/);
});

test('Invoice QR payload and renderer are invoice-number-specific data URLs', () => {
    const qrSource = read('js/services/qrService.js');
    const templateSource = read('js/services/invoicePrintTemplate.js');
    assert.match(qrSource, /invoiceNumber: String\(invoice\.invoiceNumber \|\| ''\)/);
    assert.match(qrSource, /QRCode\.toDataURL/);
    assert.match(qrSource, /payload\.invoiceNumber && invoice\.invoiceNumber !== payload\.invoiceNumber/);
    assert.match(templateSource, /invoice-qr-image/);
    assert.match(templateSource, /is missing its prepared QR image/);
});

test('Quick Print intent registers every required ICF stage', () => {
    const source = read('js/ICF/Intents/QuickPrintSelectedInvoicesIntent.js');
    ['Validate', 'Normalize', 'AddContext', 'Authorize', 'Process', 'Emit'].forEach((stageName) => {
        assert.match(source, new RegExp(stageName + ': \\{'));
    });
});
