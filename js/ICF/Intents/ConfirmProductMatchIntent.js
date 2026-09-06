import validators from "../Stages/Validators/validators.js";
import normalizers from "../Stages/Normalizers/normalizers.js";
import contextProviders from "../Stages/ContextProviders/contextProviders.js";
import authorizers from "../Stages/Authorizers/authorizers.js";
import processors from "../Stages/Processors/processors.js";
import emitters from "../Stages/Emitters/emitters.js";

function createConfirmProductMatchIntent(actor, payload) {
    return {
        type: 'ConfirmProductMatchIntent', actor: actor, payload: payload, context: {},
        meta: { source: 'product-reconciliation', createdAt: Date.now() },
        stages: {
            Validate: { validateConfirmProductMatch: validators.validateConfirmProductMatch },
            Normalize: { normalizeConfirmProductMatch: normalizers.normalizeConfirmProductMatch },
            AddContext: { addConfirmProductMatchContext: contextProviders.addConfirmProductMatchContext },
            Authorize: { authorizeConfirmProductMatch: authorizers.authorizeConfirmProductMatch },
            Process: { processConfirmProductMatch: processors.processConfirmProductMatch },
            Emit: { emitConfirmProductMatch: emitters.emitConfirmProductMatch }
        }
    };
}
export default { createConfirmProductMatchIntent: createConfirmProductMatchIntent };
