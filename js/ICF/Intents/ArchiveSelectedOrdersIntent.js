import validators from "../Stages/Validators/validators.js";
import normalizers from "../Stages/Normalizers/normalizers.js";
import contextProviders from "../Stages/ContextProviders/contextProviders.js";
import authorizers from "../Stages/Authorizers/authorizers.js";
import processors from "../Stages/Processors/processors.js";
import emitters from "../Stages/Emitters/emitters.js";

function createArchiveSelectedOrdersIntent(actor, payload, options) {
  var safeOptions = options || {};
  return {
    type: "ArchiveSelectedOrdersIntent",
    actor: actor || { id: "anonymous", role: "anonymous" },
    payload: Object.assign({}, payload || {}),
    context: {},
    privateOptions: {
      archiveApi: safeOptions.archiveApi || null,
      onProgress: typeof safeOptions.onProgress === "function" ? safeOptions.onProgress : null
    },
    meta: {
      createdAt: Date.now(),
      source: safeOptions.source || "orders-dashboard"
    },
    stages: {
      Validate: {
        requireBaseIntentShape: validators.requireBaseIntentShape,
        validateArchiveSelectedOrdersPayload: validators.validateArchiveSelectedOrdersPayload
      },
      Normalize: {
        normalizeArchiveSelectedOrdersPayload: normalizers.normalizeArchiveSelectedOrdersPayload
      },
      AddContext: {
        addTimestampContext: contextProviders.addTimestampContext,
        addSourceContext: contextProviders.addSourceContext,
        addActorRoleContext: contextProviders.addActorRoleContext,
        addArchiveSelectedOrdersContext: contextProviders.addArchiveSelectedOrdersContext
      },
      Authorize: {
        authorizeArchiveSelectedOrders: authorizers.authorizeArchiveSelectedOrders
      },
      Process: {
        processArchiveSelectedOrders: processors.processArchiveSelectedOrders
      },
      Emit: {
        emitArchiveSelectedOrdersResult: emitters.emitArchiveSelectedOrdersResult
      }
    }
  };
}

export default {
  createArchiveSelectedOrdersIntent: createArchiveSelectedOrdersIntent
};
