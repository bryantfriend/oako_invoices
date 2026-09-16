import validators from "../Stages/Validators/validators.js";
import normalizers from "../Stages/Normalizers/normalizers.js";
import contextProviders from "../Stages/ContextProviders/contextProviders.js";
import authorizers from "../Stages/Authorizers/authorizers.js";
import processors from "../Stages/Processors/processors.js";
import emitters from "../Stages/Emitters/emitters.js";

function createUpdateCustomerIntent(actor, payload) {
    return {
        type: "UpdateCustomerIntent", actor: actor, payload: payload, context: {},
        stages: {
            Validate: { validateCustomerMutation: validators.validateCustomerMutation },
            Normalize: { normalizeCustomerMutation: normalizers.normalizeCustomerMutation },
            AddContext: { addCustomerMutationContext: contextProviders.addCustomerMutationContext },
            Authorize: { authorizeCustomerMutation: authorizers.authorizeCustomerMutation },
            Process: { processCustomerMutation: processors.processCustomerMutation },
            Emit: { emitCustomerMutation: emitters.emitCustomerMutation }
        }
    };
}

export default { createUpdateCustomerIntent: createUpdateCustomerIntent };
