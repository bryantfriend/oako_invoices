import resultHelpers from '../../../engine/resultHelpers.js';
async function addInvoiceWorkflowContext(intent) {
    var api = intent.context.workflowApi;
    if (!api || typeof api.getSession !== 'function')
        return resultHelpers.contextFailure('Invoice workflow services are unavailable.');
    intent.context.session = await api.getSession();
    return resultHelpers.success(intent);
}
export default { addInvoiceWorkflowContext: addInvoiceWorkflowContext };
