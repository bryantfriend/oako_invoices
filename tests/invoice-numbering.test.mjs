import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
    buildCanonicalInvoiceNumberAssignment,
    formatCanonicalInvoiceNumber,
    getInvoiceSequenceDocumentId,
    getInvoiceSequenceYear,
    getNextInvoiceSequenceValue,
    invoiceNumberMatches,
    isTemporaryInvoiceNumber
} from '../js/services/invoiceNumberService.js';

function readText(path) {
    return fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
}

test('canonical invoice numbers use a year-scoped, zero-padded sequence', function() {
    assert.equal(getInvoiceSequenceDocumentId(2026), 'global-2026');
    assert.equal(getNextInvoiceSequenceValue(null), 1);
    assert.equal(getNextInvoiceSequenceValue({ lastValue: 41 }), 42);
    assert.equal(formatCanonicalInvoiceNumber(2026, 1), 'INV-2026-000001');
    assert.equal(formatCanonicalInvoiceNumber(2026, 1000000), 'INV-2026-1000000');
    assert.equal(getInvoiceSequenceYear(new Date('2027-01-02T12:00:00Z')), 2027);
});

test('invalid sequence state fails instead of risking a duplicate number', function() {
    assert.throws(function() {
        getNextInvoiceSequenceValue({ lastValue: -1 });
    }, /invoice_sequence_invalid/);
    assert.throws(function() {
        getNextInvoiceSequenceValue({ lastValue: 'not-a-number' });
    }, /invoice_sequence_invalid/);
    assert.throws(function() {
        formatCanonicalInvoiceNumber(2026, 0);
    }, /invoice_sequence_value_invalid/);
});

test('offline numbers become aliases when the canonical number is assigned', function() {
    const assignment = buildCanonicalInvoiceNumberAssignment({
        invoiceNumber: 'OFFLINE-000042',
        previousInvoiceNumbers: ['LEGACY-42']
    }, 2026, 7);

    assert.equal(assignment.invoiceNumber, 'INV-2026-000007');
    assert.equal(assignment.temporaryInvoiceNumber, 'OFFLINE-000042');
    assert.deepEqual(assignment.previousInvoiceNumbers, ['LEGACY-42', 'OFFLINE-000042']);
    assert.equal(assignment.invoiceNumberVersion, 2);
    assert.equal(assignment.invoiceNumberSequence, 7);
});

test('online placeholders are not retained as public aliases', function() {
    const assignment = buildCanonicalInvoiceNumberAssignment({
        invoiceNumber: 'PENDING-CANONICAL'
    }, 2026, 8);

    assert.equal(assignment.temporaryInvoiceNumber, '');
    assert.deepEqual(assignment.previousInvoiceNumbers, []);
    assert.equal(isTemporaryInvoiceNumber('PENDING-CANONICAL'), true);
    assert.equal(isTemporaryInvoiceNumber('INV-123456'), false);
});

test('QR validation accepts canonical and historical offline invoice numbers', function() {
    const invoice = {
        invoiceNumber: 'INV-2026-000009',
        temporaryInvoiceNumber: 'OFFLINE-000009',
        previousInvoiceNumbers: ['LEGACY-000009']
    };

    assert.equal(invoiceNumberMatches(invoice, 'INV-2026-000009'), true);
    assert.equal(invoiceNumberMatches(invoice, 'OFFLINE-000009'), true);
    assert.equal(invoiceNumberMatches(invoice, 'LEGACY-000009'), true);
    assert.equal(invoiceNumberMatches(invoice, 'INV-2026-999999'), false);
});

test('invoice creation and offline sync use the transactional allocator', function() {
    const invoiceService = readText('js/services/invoiceService.js');
    const integrityService = readText('js/services/dataIntegrityService.js');
    const syncService = readText('js/services/syncService.js');
    const queueService = readText('js/services/offlineQueueService.js');

    assert.doesNotMatch(invoiceService, /Date\.now\(\)\.toString\(\)\.substr\(-6\)/);
    assert.match(invoiceService, /invoiceNumber = isOffline[\s\S]*'PENDING-CANONICAL'/);
    assert.match(integrityService, /INVOICE_SEQUENCE_COLLECTION = 'invoice_sequences'/);
    assert.match(integrityService, /await transaction\.get\(sequenceRef\)/);
    assert.match(integrityService, /writeInvoiceNumberAllocation\(transaction, allocation, invoiceRef/);
    assert.match(syncService, /setInvoiceWithIntegrity\(invoiceRef, invoice,[\s\S]*returnResult: true/);
    assert.match(syncService, /markSynced\(item\.id, Object\.assign/);
    assert.match(queueService, /applyCanonicalServerResultToPayload/);
    assert.match(queueService, /invoiceNumber: serverResult\.invoiceNumber/);
});

test('Firestore rules only allow monotonic sequence increments', function() {
    const rules = readText('firebase/firestore.rules');

    assert.match(rules, /match \/invoice_sequences\/\{sequenceId\}/);
    assert.match(rules, /request\.resource\.data\.lastValue == 1/);
    assert.match(rules, /request\.resource\.data\.lastValue == resource\.data\.lastValue \+ 1/);
    assert.match(rules, /allow delete: if false/);
});
