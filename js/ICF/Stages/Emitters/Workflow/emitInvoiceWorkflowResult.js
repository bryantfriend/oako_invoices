import resultHelpers from '../../../engine/resultHelpers.js';
function emitInvoiceWorkflowResult(intent) {
    return resultHelpers.success(resultHelpers.addResultDataToIntent(intent, intent.context.workflowResult));
}
export default { emitInvoiceWorkflowResult: emitInvoiceWorkflowResult };
