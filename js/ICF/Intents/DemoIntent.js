// ICF/Intents/DemoIntent.js

import validators from "../Stages/Validators/validators.js";
import normalizers from "../Stages/Normalizers/normalizers.js";
import contextProviders from "../Stages/ContextProviders/contextProviders.js";
import authorizers from "../Stages/Authorizers/authorizers.js";
import processors from "../Stages/Processors/processors.js";
import emitters from "../Stages/Emitters/emitters.js";

var setDemoResult = processors.createSetResultDataProcessor({
  demoProcessed: true
});

var addDemoSuccessMessage = emitters.createAddSuccessMessageEmitter(
  "Demo Intent completed successfully."
);

var addDemoCompletedEvent = emitters.createAddEventEmitter(
  "DemoIntentCompleted",
  {
    category: "demo"
  }
);

/**
 * Creates a DemoIntent.
 *
 * This Intent exists to prove that the ICF pipeline is wired correctly.
 *
 * @param {Object} actor - Actor requesting the action.
 * @param {Object} payload - Intent payload.
 * @param {Object} options - Optional creation options.
 * @returns {Object} DemoIntent.
 */
function createDemoIntent(actor, payload, options) {
  var safeOptions = getSafeOptions(options);

  return {
    type: "DemoIntent",
    actor: actor,
    payload: payload,
    context: {},
    meta: {
      createdAt: Date.now(),
      source: safeOptions.source
    },
    stages: {
      Validate: {
        requireBaseIntentShape: validators.requireBaseIntentShape
      },

      Normalize: {
        passNormalization: normalizers.passNormalization
      },

      AddContext: {
        addTimestampContext: contextProviders.addTimestampContext,
        addSourceContext: contextProviders.addSourceContext,
        addActorRoleContext: contextProviders.addActorRoleContext
      },

      Authorize: {
        allow: authorizers.allow
      },

      Process: {
        setDemoResult: setDemoResult
      },

      Emit: {
        addDemoSuccessMessage: addDemoSuccessMessage,
        addDemoCompletedEvent: addDemoCompletedEvent,
        addDebugSummary: emitters.addDebugSummary
      }
    }
  };
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
      source: "system"
    };
  }

  if (!options.source) {
    options.source = "system";
  }

  return options;
}

export default {
  createDemoIntent: createDemoIntent
};