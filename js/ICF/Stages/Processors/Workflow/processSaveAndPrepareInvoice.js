import resultHelpers from '../../../engine/resultHelpers.js';
async function processSaveAndPrepareInvoice(intent) {
    var api = intent.context.workflowApi;
    var draft = intent.payload.draft;
    var saved = await api.save(draft, intent.context.session);
    // Checkpoint the saved order before invoice work. A retry reuses its identity.
    draft.orderId = saved.id;
    if (api.checkpoint) await api.checkpoint(draft);
    var invoice = intent.payload.saveOnly ? null : await api.prepare(saved);
    intent.context.workflowResult = { order: saved, invoice: invoice };
    return resultHelpers.success(intent);
}
export default { processSaveAndPrepareInvoice: processSaveAndPrepareInvoice };
