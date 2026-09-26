import validators from '../Stages/Validators/validators.js';
import normalizers from '../Stages/Normalizers/normalizers.js';
import contextProviders from '../Stages/ContextProviders/contextProviders.js';
import authorizers from '../Stages/Authorizers/authorizers.js';
import processors from '../Stages/Processors/processors.js';
import emitters from '../Stages/Emitters/emitters.js';
export function createInventoryIntent(type, payload) {
    return { type: type, actor: { id: 'pending', role: 'pending' }, payload: payload, context: {}, meta: { createdAt: Date.now(), source: 'inventory' }, stages: {
        Validate: { validateInventoryMutation: validators.validateInventoryMutation },
        Normalize: { normalizeInventoryMutation: normalizers.normalizeInventoryMutation },
        AddContext: { addInventoryMutationContext: contextProviders.addInventoryMutationContext },
        Authorize: { authorizeInventoryMutation: authorizers.authorizeInventoryMutation },
        Process: { processInventoryMutation: processors.processInventoryMutation },
        Emit: { emitInventoryMutationResult: emitters.emitInventoryMutationResult }
    } };
}
