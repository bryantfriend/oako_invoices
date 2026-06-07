import validators from "../Stages/Validators/validators.js";
import normalizers from "../Stages/Normalizers/normalizers.js";
import contextProviders from "../Stages/ContextProviders/contextProviders.js";
import authorizers from "../Stages/Authorizers/authorizers.js";
import processors from "../Stages/Processors/processors.js";
import emitters from "../Stages/Emitters/emitters.js";

function createRecordInvoiceReturnIntent(actor, payload, options) {
  var safeOptions = options || {};

  return {
    type: "RecordInvoiceReturnIntent",
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
        validateRecordInvoiceReturnPayload: validators.validateRecordInvoiceReturnPayload
      },
      Normalize: {
        normalizeRecordInvoiceReturnPayload: normalizers.normalizeRecordInvoiceReturnPayload
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
        processRecordInvoiceReturn: processors.processRecordInvoiceReturn
      },
      Emit: {
        emitRecordInvoiceReturnResult: emitters.emitRecordInvoiceReturnResult
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
  createRecordInvoiceReturnIntent: createRecordInvoiceReturnIntent
};
