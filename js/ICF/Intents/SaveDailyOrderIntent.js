import validators from "../Stages/Validators/validators.js";
import normalizers from "../Stages/Normalizers/normalizers.js";
import contextProviders from "../Stages/ContextProviders/contextProviders.js";
import authorizers from "../Stages/Authorizers/authorizers.js";
import processors from "../Stages/Processors/processors.js";
import emitters from "../Stages/Emitters/emitters.js";

function createSaveDailyOrderIntent(actor, payload, options) {
    var safeActor = actor || { id: 'anonymous', role: 'anonymous' };
    var safeOptions = options || {};
    return {
        type: 'SaveDailyOrderIntent',
        actor: {
            id: safeActor.id || 'anonymous',
            role: safeActor.role || 'anonymous'
        },
        payload: Object.assign({}, payload || {}),
        context: {},
        meta: {
            createdAt: Date.now(),
            source: safeOptions.source || 'daily-orders'
        },
        stages: {
            Validate: {
                requireBaseIntentShape: validators.requireBaseIntentShape,
                validateSaveDailyOrderPayload: validators.validateSaveDailyOrderPayload
            },
            Normalize: {
                normalizeSaveDailyOrderPayload: normalizers.normalizeSaveDailyOrderPayload
            },
            AddContext: {
                addTimestampContext: contextProviders.addTimestampContext,
                addSourceContext: contextProviders.addSourceContext,
                addActorRoleContext: contextProviders.addActorRoleContext
            },
            Authorize: {
                authorizeOrderMutation: authorizers.authorizeOrderMutation
            },
            Process: {
                processSaveDailyOrder: processors.processSaveDailyOrder
            },
            Emit: {
                emitSaveDailyOrderResult: emitters.emitSaveDailyOrderResult
            }
        }
    };
}

export default {
    createSaveDailyOrderIntent: createSaveDailyOrderIntent
};
