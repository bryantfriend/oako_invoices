import validators from "../Stages/Validators/validators.js";
import normalizers from "../Stages/Normalizers/normalizers.js";
import contextProviders from "../Stages/ContextProviders/contextProviders.js";
import authorizers from "../Stages/Authorizers/authorizers.js";
import processors from "../Stages/Processors/processors.js";
import emitters from "../Stages/Emitters/emitters.js";

function createUpdateInvoiceItemsIntent(actor, payload, options) {
  var safeOptions = options || {};

  return {
    type: "UpdateInvoiceItemsIntent",
    actor: getSafeActor(actor),
    payload: Object.assign({}, payload || {}),
    context: {},
    meta: {
      createdAt: Date.now(),
      source: safeOptions.source || "ui"
    },
    stages: {
      Validate: {
        requireBaseIntentShape: validators.requireBaseIntentShape,
        validateUpdateInvoiceItemsPayload: validators.validateUpdateInvoiceItemsPayload
      },
      Normalize: {
        normalizeUpdateInvoiceItemsPayload: normalizers.normalizeUpdateInvoiceItemsPayload
      },
      AddContext: {
        addTimestampContext: contextProviders.addTimestampContext,
        addSourceContext: contextProviders.addSourceContext,
        addActorRoleContext: contextProviders.addActorRoleContext,
        addInvoiceMutationContext: contextProviders.addInvoiceMutationContext
      },
      Authorize: {
        authorizeInvoiceMutation: authorizers.authorizeInvoiceMutation
      },
      Process: {
        processUpdateInvoiceItems: processors.processUpdateInvoiceItems
      },
      Emit: {
        emitUpdateInvoiceItemsResult: emitters.emitUpdateInvoiceItemsResult
      }
    }
  };
}

function getSafeActor(actor) {
  if (!actor) {
    return { id: "anonymous", role: "anonymous" };
  }

  return {
    id: actor.id || "anonymous",
    role: actor.role || "anonymous"
  };
}

export default {
  createUpdateInvoiceItemsIntent: createUpdateInvoiceItemsIntent
};
