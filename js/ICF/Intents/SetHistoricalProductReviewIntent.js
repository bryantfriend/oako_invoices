import validators from "../Stages/Validators/validators.js";
import normalizers from "../Stages/Normalizers/normalizers.js";
import contextProviders from "../Stages/ContextProviders/contextProviders.js";
import authorizers from "../Stages/Authorizers/authorizers.js";
import processors from "../Stages/Processors/processors.js";
import emitters from "../Stages/Emitters/emitters.js";

function createSetHistoricalProductReviewIntent(actor, payload) {
    return {
        type: 'SetHistoricalProductReviewIntent', actor: actor, payload: payload, context: {},
        meta: { source: 'legacy-products', createdAt: Date.now() },
        stages: {
            Validate: { validateSetHistoricalProductReview: validators.validateSetHistoricalProductReview },
            Normalize: { normalizeSetHistoricalProductReview: normalizers.normalizeSetHistoricalProductReview },
            AddContext: { addSetHistoricalProductReviewContext: contextProviders.addSetHistoricalProductReviewContext },
            Authorize: { authorizeSetHistoricalProductReview: authorizers.authorizeSetHistoricalProductReview },
            Process: { processSetHistoricalProductReview: processors.processSetHistoricalProductReview },
            Emit: { emitSetHistoricalProductReview: emitters.emitSetHistoricalProductReview }
        }
    };
}
export default { createSetHistoricalProductReviewIntent: createSetHistoricalProductReviewIntent };

