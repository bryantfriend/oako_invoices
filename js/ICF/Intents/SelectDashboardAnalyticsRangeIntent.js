import validators from "../Stages/Validators/validators.js";
import normalizers from "../Stages/Normalizers/normalizers.js";
import contextProviders from "../Stages/ContextProviders/contextProviders.js";
import authorizers from "../Stages/Authorizers/authorizers.js";
import processors from "../Stages/Processors/processors.js";
import emitters from "../Stages/Emitters/emitters.js";

function createSelectDashboardAnalyticsRangeIntent(actor, payload, options) {
  var safeOptions = options || {};
  return {
    type: "SelectDashboardAnalyticsRangeIntent",
    actor: actor || { id: "anonymous", role: "anonymous" },
    payload: payload ? Object.assign({}, payload) : {},
    context: {},
    meta: {
      createdAt: Date.now(),
      source: safeOptions.source || "dashboard"
    },
    stages: {
      Validate: {
        requireBaseIntentShape: validators.requireBaseIntentShape,
        validateDashboardAnalyticsRangePayload: validators.validateDashboardAnalyticsRangePayload
      },
      Normalize: {
        normalizeDashboardAnalyticsRangePayload: normalizers.normalizeDashboardAnalyticsRangePayload
      },
      AddContext: {
        addTimestampContext: contextProviders.addTimestampContext,
        addSourceContext: contextProviders.addSourceContext,
        addActorRoleContext: contextProviders.addActorRoleContext
      },
      Authorize: {
        authorizeDashboardAnalyticsRange: authorizers.authorizeDashboardAnalyticsRange
      },
      Process: {
        processDashboardAnalyticsRange: processors.processDashboardAnalyticsRange
      },
      Emit: {
        emitDashboardAnalyticsRangeResult: emitters.emitDashboardAnalyticsRangeResult
      }
    }
  };
}

export default {
  createSelectDashboardAnalyticsRangeIntent: createSelectDashboardAnalyticsRangeIntent
};
