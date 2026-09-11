import resultHelpers from '../../../engine/resultHelpers.js';
function normalizeInvoiceWorkflowPayload(intent) {
    if (intent.payload.draft)
        intent.payload.draft.customerName = String(intent.payload.draft.customerName || '').trim();
    return resultHelpers.success(intent);
}
export default { normalizeInvoiceWorkflowPayload: normalizeInvoiceWorkflowPayload };
