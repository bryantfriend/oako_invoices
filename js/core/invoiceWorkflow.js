const WORKFLOW_STATE = {
    DRAFT: 'draft',
    SUBMITTED: 'submitted',
    APPROVED: 'approved',
    FULFILLED: 'fulfilled',
    ARCHIVED: 'archived'
};

function normalizeInvoiceWorkflowState(recordOrStatus) {
    var status = '';

    if (typeof recordOrStatus === 'string') {
        status = recordOrStatus;
    } else if (recordOrStatus && recordOrStatus.status) {
        status = recordOrStatus.status;
    }

    status = String(status || 'draft').toLowerCase();

    if (status === 'draft') {
        return WORKFLOW_STATE.DRAFT;
    }

    if (status === 'submitted' || status === 'pending') {
        return WORKFLOW_STATE.SUBMITTED;
    }

    if (status === 'approved' || status === 'confirmed') {
        return WORKFLOW_STATE.APPROVED;
    }

    if (status === 'archived') {
        return WORKFLOW_STATE.ARCHIVED;
    }

    if (isFulfilledAlias(status)) {
        return WORKFLOW_STATE.FULFILLED;
    }

    return WORKFLOW_STATE.SUBMITTED;
}

function isFulfilledAlias(status) {
    var normalized = String(status || '').toLowerCase();
    return [
        'fulfilled',
        'fullfilled',
        'completed',
        'paid',
        'returned',
        'partially_returned',
        'partial_return',
        'fully_returned',
        'return_pending',
        'completed_pending_sync'
    ].indexOf(normalized) !== -1;
}

function canEditInvoiceItems(recordOrStatus) {
    return normalizeInvoiceWorkflowState(recordOrStatus) === WORKFLOW_STATE.DRAFT;
}

function canEditInvoiceDate(recordOrStatus) {
    return normalizeInvoiceWorkflowState(recordOrStatus) === WORKFLOW_STATE.DRAFT;
}

function canRecordInvoiceReturn(recordOrStatus) {
    return normalizeInvoiceWorkflowState(recordOrStatus) === WORKFLOW_STATE.FULFILLED;
}

function canFulfillInvoice(recordOrStatus) {
    return normalizeInvoiceWorkflowState(recordOrStatus) === WORKFLOW_STATE.APPROVED;
}

function isInvoiceReadOnly(recordOrStatus) {
    return normalizeInvoiceWorkflowState(recordOrStatus) === WORKFLOW_STATE.ARCHIVED;
}

function getInvoiceWorkflowLockMessage(recordOrStatus) {
    var state = normalizeInvoiceWorkflowState(recordOrStatus);

    if (state === WORKFLOW_STATE.DRAFT) {
        return '';
    }

    if (state === WORKFLOW_STATE.FULFILLED) {
        return 'Fulfilled invoices are locked. Only returns can be recorded.';
    }

    if (state === WORKFLOW_STATE.ARCHIVED) {
        return 'Archived invoices are read only.';
    }

    if (state === WORKFLOW_STATE.SUBMITTED) {
        return 'Submitted invoices are locked and cannot be edited.';
    }

    if (state === WORKFLOW_STATE.APPROVED) {
        return 'Approved invoices are locked and cannot be edited.';
    }

    return 'This invoice is locked and cannot be edited.';
}

function getCanonicalInvoiceStatus(status) {
    var normalized = String(status || '').toLowerCase();

    if (normalized === 'pending') {
        return 'submitted';
    }

    if (normalized === 'confirmed') {
        return 'approved';
    }

    if (normalized === 'completed' || normalized === 'fullfilled') {
        return 'fulfilled';
    }

    return normalized || 'draft';
}

export {
    WORKFLOW_STATE,
    canEditInvoiceDate,
    canEditInvoiceItems,
    canFulfillInvoice,
    canRecordInvoiceReturn,
    getCanonicalInvoiceStatus,
    getInvoiceWorkflowLockMessage,
    isInvoiceReadOnly,
    normalizeInvoiceWorkflowState
};
