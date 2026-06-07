function safeNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function getItemOriginalQuantity(item = {}) {
    if (item.quantity !== undefined) return safeNumber(item.quantity, 0);
    if (item.requestedQuantity !== undefined) return safeNumber(item.requestedQuantity, 0);
    if (item.adjustedQuantity !== undefined) return safeNumber(item.adjustedQuantity, 0);
    return 0;
}

export function getTotalOriginalQuantity(record = {}) {
    return (record.items || []).reduce(function(total, item) {
        return total + getItemOriginalQuantity(item);
    }, 0);
}

export function getTotalReturnedQuantity(record = {}) {
    if (record.returnSummary && safeNumber(record.returnSummary.totalReturnedQuantity, 0) > 0) {
        return safeNumber(record.returnSummary.totalReturnedQuantity, 0);
    }

    return (record.items || []).reduce(function(total, item) {
        return total + safeNumber(item.returnedQuantity !== undefined ? item.returnedQuantity : item.returnQuantity, 0);
    }, 0);
}

export function getReturnState(record = {}) {
    const status = String(record.status || '').toLowerCase();
    const totalOriginalQuantity = getTotalOriginalQuantity(record);
    const totalReturnedQuantity = getTotalReturnedQuantity(record);

    if (totalReturnedQuantity <= 0) {
        if (['returned', 'fully_returned'].includes(status)) {
            return 'full';
        }
        if (['partially_returned', 'partial_return'].includes(status)) {
            return 'partial';
        }
        return 'none';
    }

    if (totalOriginalQuantity > 0 && totalReturnedQuantity >= totalOriginalQuantity) {
        return 'full';
    }

    return 'partial';
}

export function existingStatusLabel(status = '') {
    const normalized = String(status || 'draft').toLowerCase();
    const labels = {
        draft: 'Draft',
        submitted: 'Submitted',
        pending: 'Pending',
        approved: 'Approved',
        confirmed: 'Confirmed',
        returned: 'Returned',
        partially_returned: 'Partially Returned',
        partial_return: 'Partially Returned',
        fully_returned: 'Returned',
        fulfilled: 'Fulfilled',
        fullfilled: 'Fulfilled',
        paid: 'Paid',
        cancelled: 'Cancelled',
        canceled: 'Cancelled',
        completed: 'Completed',
        return_pending: 'Return Pending',
        completed_pending_sync: 'Completed Pending Sync',
        sync_conflict: 'Sync Conflict',
        archived: 'Archived'
    };

    return labels[normalized] || normalized.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

export function getDisplayStatus(recordOrStatus = {}) {
    const record = typeof recordOrStatus === 'string'
        ? { status: recordOrStatus }
        : (recordOrStatus || {});
    const returnState = getReturnState(record);

    if (returnState === 'full') {
        return 'Returned';
    }
    if (returnState === 'partial') {
        return 'Partially Returned';
    }

    return existingStatusLabel(record.status);
}

export function isReturnFilterMatch(record = {}, filterStatus = 'all') {
    const filter = String(filterStatus || 'all').toLowerCase();
    const returnState = getReturnState(record);

    if (filter === 'returned' || filter === 'fully_returned') {
        return returnState === 'full';
    }
    if (filter === 'partially_returned' || filter === 'partial_return') {
        return returnState === 'partial';
    }
    if (filter === 'any_return') {
        return returnState !== 'none';
    }

    return false;
}

export function normalizeStatusKey(recordOrStatus = {}) {
    const record = typeof recordOrStatus === 'string'
        ? { status: recordOrStatus }
        : (recordOrStatus || {});
    const returnState = getReturnState(record);

    if (returnState === 'full') return 'returned';
    if (returnState === 'partial') return 'partially_returned';
    if (record.status === 'fullfilled') return 'fulfilled';
    return record.status || 'draft';
}
