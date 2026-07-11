// ICF/Intents/UpdateOrderStatusIntent.js

import validators from "../Stages/Validators/validators.js";
import normalizers from "../Stages/Normalizers/normalizers.js";
import contextProviders from "../Stages/ContextProviders/contextProviders.js";
import authorizers from "../Stages/Authorizers/authorizers.js";
import processors from "../Stages/Processors/processors.js";
import emitters from "../Stages/Emitters/emitters.js";

/**
 * Creates an UpdateOrderStatusIntent.
 *
 * @param {Object} actor - Actor requesting the action.
 * @param {Object} payload - Intent payload.
 * @param {Object} options - Optional creation options.
 * @returns {Object} UpdateOrderStatusIntent.
 */
function createUpdateOrderStatusIntent(actor, payload, options) {
  var safeOptions = getSafeOptions(options);

  return {
    type: "UpdateOrderStatusIntent",
    actor: getSafeActor(actor),
    payload: getSafePayload(payload),
    context: {},
    meta: {
      createdAt: Date.now(),
      source: safeOptions.source
    },
    stages: {
      Validate: {
        requireBaseIntentShape: validators.requireBaseIntentShape,
        validateUpdateOrderStatusPayload: validators.validateUpdateOrderStatusPayload
      },

      Normalize: {
        normalizeUpdateOrderStatusPayload: normalizers.normalizeUpdateOrderStatusPayload
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
        processUpdateOrderStatus: processors.processUpdateOrderStatus
      },

      Emit: {
        emitUpdateOrderStatusResult: emitters.emitUpdateOrderStatusResult
      }
    }
  };
}

/**
 * Creates a safe actor shape for pipeline validation.
 *
 * @param {Object} actor - Actor input.
 * @returns {Object} Safe actor.
 */
function getSafeActor(actor) {
  if (!actor) {
    return {
      id: "anonymous",
      role: "anonymous"
    };
  }

  return {
    id: actor.id || "anonymous",
    role: actor.role || "anonymous"
  };
}

/**
 * Creates a safe payload shape for pipeline validation.
 *
 * @param {Object} payload - Payload input.
 * @returns {Object} Safe payload.
 */
function getSafePayload(payload) {
  if (!payload) {
    return {};
  }

  return Object.assign({}, payload);
}

/**
 * Creates safe options with defaults.
 *
 * @param {Object} options - Optional creation options.
 * @returns {Object} Safe options.
 */
function getSafeOptions(options) {
  if (!options) {
    return {
      source: "ui"
    };
  }

  if (!options.source) {
    options.source = "ui";
  }

  return options;
}

export default {
  createUpdateOrderStatusIntent: createUpdateOrderStatusIntent
};
