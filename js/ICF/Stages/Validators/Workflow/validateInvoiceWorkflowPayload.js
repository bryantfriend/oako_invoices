import resultHelpers from '../../../engine/resultHelpers.js';

function validateInvoiceWorkflowPayload(intent) {
    var payload = intent.payload || {};
    if (intent.type === 'SaveAndPrepareInvoiceIntent') {
        var draft = payload.draft || {};
        if (!/^[a-zA-Z0-9_-]{8,200}$/.test(draft.requestId || ''))
            return resultHelpers.validationFailure('A stable save reference is required.');
        if (!String(draft.customerName || '').trim())
            return resultHelpers.validationFailure('Choose a customer.');
        if (
            !/^\d{4}-\d{2}-\d{2}$/.test(draft.orderDate || '') ||
            Number.isNaN(new Date(draft.orderDate + 'T12:00:00').getTime())
        )
            return resultHelpers.validationFailure('Choose a valid delivery date.');
        var dateParts = draft.orderDate.split('-').map(Number);
        var parsedDate = new Date(draft.orderDate + 'T12:00:00');
        if (
            parsedDate.getFullYear() !== dateParts[0] ||
            parsedDate.getMonth() + 1 !== dateParts[1] ||
            parsedDate.getDate() !== dateParts[2]
        )
            return resultHelpers.validationFailure('Choose a valid delivery date.');
        if (
            !Array.isArray(draft.items) ||
            !draft.items.some(function (item) {
                return Number(item.quantity) > 0;
            })
        )
            return resultHelpers.validationFailure('Add a product with a positive quantity.');
        if (
            draft.items.some(function (item) {
                return !Number.isFinite(Number(item.quantity)) || Number(item.quantity) < 0;
            })
        )
            return resultHelpers.validationFailure('Quantities must be finite and cannot be negative.');
        if (
            draft.items.some(function (item) {
                return (
                    Number(item.quantity) > 0 &&
                    (item.productMatchPending ||
                        !Number.isFinite(Number(item.quantity)) ||
                        Number(item.quantity) < 0 ||
                        !Number.isFinite(
                            Number(item.unitPrice !== undefined ? item.unitPrice : item.price),
                        ) ||
                        Number(item.unitPrice !== undefined ? item.unitPrice : item.price) < 0)
                );
            })
        )
            return resultHelpers.validationFailure(
                'Resolve product matches and invalid quantities or prices before saving.',
            );
    } else if (intent.type === 'PrepareInvoiceBatchIntent') {
        if (!Array.isArray(payload.rows) || !payload.rows.length || payload.rows.length > 200)
            return resultHelpers.validationFailure('Select between 1 and 200 orders.');
    } else if (intent.type === 'RunWorkflowEffectIntent') {
        if (
            !payload.effect ||
            ['sheets', 'reward'].indexOf(payload.effect.kind) === -1 ||
            !payload.effect.entityId
        )
            return resultHelpers.validationFailure('Unknown background action.');
    } else return resultHelpers.validationFailure('Unknown invoice workflow.');
    return resultHelpers.success(intent);
}
export default { validateInvoiceWorkflowPayload: validateInvoiceWorkflowPayload };
