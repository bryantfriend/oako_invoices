import resultHelpers from '../../../engine/resultHelpers.js';
async function processRunWorkflowEffect(intent) {
    intent.context.workflowResult = await intent.context.workflowApi.performEffect(intent.payload.effect);
    return resultHelpers.success(intent);
}
export default { processRunWorkflowEffect: processRunWorkflowEffect };
