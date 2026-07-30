const CANONICAL_INVOICE_NUMBER_VERSION = 2;
const CANONICAL_INVOICE_NUMBER_PREFIX = 'INV';
const INVOICE_SEQUENCE_DOCUMENT_PREFIX = 'global';

function getDateFromValue(value) {
    if (!value) {
        return null;
    }
    if (typeof value.toDate === 'function') {
        return value.toDate();
    }
    if (value instanceof Date) {
        return value;
    }
    if (value.seconds) {
        return new Date(value.seconds * 1000);
    }

    var parsedDate = new Date(value);
    if (Number.isNaN(parsedDate.getTime())) {
        return null;
    }
    return parsedDate;
}

export function getInvoiceSequenceYear(invoiceDate, fallbackDate) {
    var resolvedDate = getDateFromValue(invoiceDate) || getDateFromValue(fallbackDate) || new Date();
    return resolvedDate.getFullYear();
}

export function getInvoiceSequenceDocumentId(year) {
    return INVOICE_SEQUENCE_DOCUMENT_PREFIX + '-' + String(year);
}

export function getNextInvoiceSequenceValue(sequenceData) {
    var currentValue = Number(sequenceData && sequenceData.lastValue ? sequenceData.lastValue : 0);
    if (!Number.isSafeInteger(currentValue) || currentValue < 0) {
        throw new Error('invoice_sequence_invalid');
    }
    return currentValue + 1;
}

export function formatCanonicalInvoiceNumber(year, sequenceValue) {
    var safeYear = Number(year);
    var safeSequenceValue = Number(sequenceValue);

    if (!Number.isInteger(safeYear) || safeYear < 2000 || safeYear > 9999) {
        throw new Error('invoice_sequence_year_invalid');
    }
    if (!Number.isSafeInteger(safeSequenceValue) || safeSequenceValue < 1) {
        throw new Error('invoice_sequence_value_invalid');
    }

    return CANONICAL_INVOICE_NUMBER_PREFIX
        + '-'
        + String(safeYear)
        + '-'
        + String(safeSequenceValue).padStart(6, '0');
}

export function isTemporaryInvoiceNumber(invoiceNumber) {
    var safeNumber = String(invoiceNumber || '').trim().toUpperCase();
    return !safeNumber
        || safeNumber.indexOf('OFFLINE-') === 0
        || safeNumber.indexOf('PENDING-') === 0;
}

function appendUniqueInvoiceNumber(invoiceNumbers, invoiceNumber) {
    var safeNumber = String(invoiceNumber || '').trim();
    if (!safeNumber || invoiceNumbers.indexOf(safeNumber) !== -1) {
        return;
    }
    invoiceNumbers.push(safeNumber);
}

export function buildCanonicalInvoiceNumberAssignment(invoicePayload, year, sequenceValue) {
    var source = invoicePayload || {};
    var previousInvoiceNumbers = Array.isArray(source.previousInvoiceNumbers)
        ? source.previousInvoiceNumbers.slice()
        : [];
    var requestedInvoiceNumber = String(source.invoiceNumber || '').trim();
    var temporaryInvoiceNumber = requestedInvoiceNumber.toUpperCase().indexOf('OFFLINE-') === 0
        ? requestedInvoiceNumber
        : String(source.temporaryInvoiceNumber || '').trim();

    appendUniqueInvoiceNumber(previousInvoiceNumbers, temporaryInvoiceNumber);

    return {
        invoiceNumber: formatCanonicalInvoiceNumber(year, sequenceValue),
        invoiceNumberVersion: CANONICAL_INVOICE_NUMBER_VERSION,
        invoiceNumberYear: Number(year),
        invoiceNumberSequence: Number(sequenceValue),
        temporaryInvoiceNumber: temporaryInvoiceNumber,
        previousInvoiceNumbers: previousInvoiceNumbers
    };
}

export function invoiceNumberMatches(invoice, requestedInvoiceNumber) {
    var source = invoice || {};
    var requestedNumber = String(requestedInvoiceNumber || '').trim();
    if (!requestedNumber) {
        return true;
    }
    if (String(source.invoiceNumber || '').trim() === requestedNumber) {
        return true;
    }
    if (String(source.temporaryInvoiceNumber || '').trim() === requestedNumber) {
        return true;
    }

    var previousInvoiceNumbers = Array.isArray(source.previousInvoiceNumbers)
        ? source.previousInvoiceNumbers
        : [];
    return previousInvoiceNumbers.indexOf(requestedNumber) !== -1;
}

export const invoiceNumberService = {
    buildCanonicalInvoiceNumberAssignment: buildCanonicalInvoiceNumberAssignment,
    formatCanonicalInvoiceNumber: formatCanonicalInvoiceNumber,
    getInvoiceSequenceDocumentId: getInvoiceSequenceDocumentId,
    getInvoiceSequenceYear: getInvoiceSequenceYear,
    getNextInvoiceSequenceValue: getNextInvoiceSequenceValue,
    invoiceNumberMatches: invoiceNumberMatches,
    isTemporaryInvoiceNumber: isTemporaryInvoiceNumber
};
