import validators from "../Stages/Validators/validators.js";
import normalizers from "../Stages/Normalizers/normalizers.js";
import contextProviders from "../Stages/ContextProviders/contextProviders.js";
import authorizers from "../Stages/Authorizers/authorizers.js";
import processors from "../Stages/Processors/processors.js";
import emitters from "../Stages/Emitters/emitters.js";

function createMarkInvoicePrintedIntent(actor, payload, options) {
  var safeOptions = options || {};
  return {
    type: "MarkInvoicePrintedIntent",
    actor: getSafeActor(actor),
    payload: payload ? Object.assign({}, payload) : {},
    context: {},
    meta: {
      createdAt: Date.now(),
      source: safeOptions.source || "invoice-print"
    },
    privateOptions: {
      printApi: safeOptions.printApi || null
    },
    stages: {
      Validate: {
        requireBaseIntentShape: validators.requireBaseIntentShape,
        validateMarkInvoicePrintedPayload: validators.validateMarkInvoicePrintedPayload
      },
      Normalize: {
        normalizeMarkInvoicePrintedPayload: normalizers.normalizeMarkInvoicePrintedPayload
      },
      AddContext: {
        addTimestampContext: contextProviders.addTimestampContext,
        addSourceContext: contextProviders.addSourceContext,
        addActorRoleContext: contextProviders.addActorRoleContext,
        addMarkInvoicePrintedContext: contextProviders.addMarkInvoicePrintedContext
      },
      Authorize: {
        authorizeMarkInvoicePrinted: authorizers.authorizeMarkInvoicePrinted
      },
      Process: {
        processMarkInvoicePrinted: processors.processMarkInvoicePrinted
      },
      Emit: {
        emitMarkInvoicePrintedResult: emitters.emitMarkInvoicePrintedResult
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
  createMarkInvoicePrintedIntent: createMarkInvoicePrintedIntent
};
