import validators from '../Stages/Validators/validators.js';
import normalizers from '../Stages/Normalizers/normalizers.js';
import contextProviders from '../Stages/ContextProviders/contextProviders.js';
import authorizers from '../Stages/Authorizers/authorizers.js';
import processors from '../Stages/Processors/processors.js';
import emitters from '../Stages/Emitters/emitters.js';

function createRetrySyncItemsIntent(actor, payload, api) {
    return {
        type: 'RetrySyncItemsIntent', actor: actor, payload: payload,
        context: { retryApi: api }, meta: { createdAt: Date.now(), source: 'sync-recovery' },
        stages: {
            Validate: { validateRetrySyncPayload: validators.validateRetrySyncPayload },
            Normalize: { normalizeRetrySyncPayload: normalizers.normalizeRetrySyncPayload },
            AddContext: { addRetrySyncContext: contextProviders.addRetrySyncContext },
            Authorize: { authorizeRetrySync: authorizers.authorizeRetrySync },
            Process: { processRetrySync: processors.processRetrySync },
            Emit: { emitRetrySyncResult: emitters.emitRetrySyncResult }
        }
    };
}
export default { createRetrySyncItemsIntent: createRetrySyncItemsIntent };
