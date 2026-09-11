import validators from '../Stages/Validators/validators.js';
import normalizers from '../Stages/Normalizers/normalizers.js';
import contextProviders from '../Stages/ContextProviders/contextProviders.js';
import authorizers from '../Stages/Authorizers/authorizers.js';
import processors from '../Stages/Processors/processors.js';
import emitters from '../Stages/Emitters/emitters.js';

function createPrepareInvoiceBatchIntent(actor, payload, options) {
    return {
        type: 'PrepareInvoiceBatchIntent',
        actor: actor,
        payload: payload,
        context: { workflowApi: options.api },
        meta: { createdAt: Date.now(), source: options.source || 'invoice-workflow' },
        stages: {
            Validate: {
                requireBaseIntentShape: validators.requireBaseIntentShape,
                validateInvoiceWorkflowPayload: validators.validateInvoiceWorkflowPayload,
            },
            Normalize: { normalizeInvoiceWorkflowPayload: normalizers.normalizeInvoiceWorkflowPayload },
            AddContext: { addInvoiceWorkflowContext: contextProviders.addInvoiceWorkflowContext },
            Authorize: { authorizeInvoiceWorkflow: authorizers.authorizeInvoiceWorkflow },
            Process: { processPrepareInvoiceBatch: processors.processPrepareInvoiceBatch },
            Emit: { emitInvoiceWorkflowResult: emitters.emitInvoiceWorkflowResult },
        },
    };
}
export default { createPrepareInvoiceBatchIntent: createPrepareInvoiceBatchIntent };
