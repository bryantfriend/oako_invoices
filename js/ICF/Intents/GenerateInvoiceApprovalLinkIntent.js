// ICF/Intents/GenerateInvoiceApprovalLinkIntent.js

import validators from "../Stages/Validators/validators.js";
import normalizers from "../Stages/Normalizers/normalizers.js";
import contextProviders from "../Stages/ContextProviders/contextProviders.js";
import authorizers from "../Stages/Authorizers/authorizers.js";
import processors from "../Stages/Processors/processors.js";
import emitters from "../Stages/Emitters/emitters.js";

function createGenerateInvoiceApprovalLinkIntent(actor, payload, options) {
  var safeOptions = getSafeOptions(options);

  return {
    type: "GenerateInvoiceApprovalLinkIntent",
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
        validateGenerateInvoiceApprovalLinkPayload: validators.validateGenerateInvoiceApprovalLinkPayload
      },
      Normalize: {
        normalizeGenerateInvoiceApprovalLinkPayload: normalizers.normalizeGenerateInvoiceApprovalLinkPayload
      },
      AddContext: {
        addTimestampContext: contextProviders.addTimestampContext,
        addSourceContext: contextProviders.addSourceContext,
        addActorRoleContext: contextProviders.addActorRoleContext,
        addGenerateInvoiceApprovalLinkContext: contextProviders.addGenerateInvoiceApprovalLinkContext
      },
      Authorize: {
        authorizeGenerateInvoiceApprovalLink: authorizers.authorizeGenerateInvoiceApprovalLink
      },
      Process: {
        processGenerateInvoiceApprovalLink: processors.processGenerateInvoiceApprovalLink
      },
      Emit: {
        emitGenerateInvoiceApprovalLinkResult: emitters.emitGenerateInvoiceApprovalLinkResult
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
      source: "ui"
    };
  }

  if (!options.source) {
    options.source = "ui";
  }

  return options;
}

export default {
  createGenerateInvoiceApprovalLinkIntent: createGenerateInvoiceApprovalLinkIntent
};
