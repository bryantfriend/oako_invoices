// ICF/Intents/SubmitInvoiceApprovalResponseIntent.js

import validators from "../Stages/Validators/validators.js";
import normalizers from "../Stages/Normalizers/normalizers.js";
import contextProviders from "../Stages/ContextProviders/contextProviders.js";
import authorizers from "../Stages/Authorizers/authorizers.js";
import processors from "../Stages/Processors/processors.js";
import emitters from "../Stages/Emitters/emitters.js";

function createSubmitInvoiceApprovalResponseIntent(actor, payload, options) {
  var safeOptions = getSafeOptions(options);

  return {
    type: "SubmitInvoiceApprovalResponseIntent",
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
        validateSubmitInvoiceApprovalResponsePayload: validators.validateSubmitInvoiceApprovalResponsePayload
      },
      Normalize: {
        normalizeSubmitInvoiceApprovalResponsePayload: normalizers.normalizeSubmitInvoiceApprovalResponsePayload
      },
      AddContext: {
        addTimestampContext: contextProviders.addTimestampContext,
        addSourceContext: contextProviders.addSourceContext,
        addActorRoleContext: contextProviders.addActorRoleContext,
        addSubmitInvoiceApprovalResponseContext: contextProviders.addSubmitInvoiceApprovalResponseContext
      },
      Authorize: {
        authorizeSubmitInvoiceApprovalResponse: authorizers.authorizeSubmitInvoiceApprovalResponse
      },
      Process: {
        processSubmitInvoiceApprovalResponse: processors.processSubmitInvoiceApprovalResponse
      },
      Emit: {
        emitSubmitInvoiceApprovalResponseResult: emitters.emitSubmitInvoiceApprovalResponseResult
      }
    }
  };
}

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

function getSafePayload(payload) {
  if (!payload) {
    return {};
  }

  return Object.assign({}, payload);
}

function getSafeOptions(options) {
  if (!options) {
    return {
      source: "customer-review"
    };
  }

  if (!options.source) {
    options.source = "customer-review";
  }

  return options;
}

export default {
  createSubmitInvoiceApprovalResponseIntent: createSubmitInvoiceApprovalResponseIntent
};
