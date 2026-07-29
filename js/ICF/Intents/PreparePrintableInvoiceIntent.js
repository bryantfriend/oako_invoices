import validators from "../Stages/Validators/validators.js";
import normalizers from "../Stages/Normalizers/normalizers.js";
import contextProviders from "../Stages/ContextProviders/contextProviders.js";
import authorizers from "../Stages/Authorizers/authorizers.js";
import processors from "../Stages/Processors/processors.js";
import emitters from "../Stages/Emitters/emitters.js";

function createPreparePrintableInvoiceIntent(actor, payload, options) {
  var safeOptions = options || {};
  return {
    type: "PreparePrintableInvoiceIntent",
    actor: getSafeActor(actor),
    payload: payload ? Object.assign({}, payload) : {},
    context: {},
    meta: {
      createdAt: Date.now(),
      source: safeOptions.source || "order-print"
    },
    privateOptions: {
      invoiceApi: safeOptions.invoiceApi || null,
      orderSnapshot: safeOptions.orderSnapshot || null,
      generationOptions: safeOptions.generationOptions || {}
    },
    stages: {
      Validate: {
        requireBaseIntentShape: validators.requireBaseIntentShape,
        validatePreparePrintableInvoicePayload: validators.validatePreparePrintableInvoicePayload
      },
      Normalize: {
        normalizePreparePrintableInvoicePayload: normalizers.normalizePreparePrintableInvoicePayload
      },
      AddContext: {
        addTimestampContext: contextProviders.addTimestampContext,
        addSourceContext: contextProviders.addSourceContext,
        addActorRoleContext: contextProviders.addActorRoleContext,
        addPreparePrintableInvoiceContext: contextProviders.addPreparePrintableInvoiceContext
      },
      Authorize: {
        authorizePreparePrintableInvoice: authorizers.authorizePreparePrintableInvoice
      },
      Process: {
        processPreparePrintableInvoice: processors.processPreparePrintableInvoice
      },
      Emit: {
        emitPreparePrintableInvoiceResult: emitters.emitPreparePrintableInvoiceResult
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
  createPreparePrintableInvoiceIntent: createPreparePrintableInvoiceIntent
};
