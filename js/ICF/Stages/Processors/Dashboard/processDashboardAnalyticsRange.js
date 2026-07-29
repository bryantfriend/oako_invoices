import resultHelpers from "../../../engine/resultHelpers.js";

function processDashboardAnalyticsRange(intent) {
  if (!intent || !intent.payload) {
    return resultHelpers.processFailure("Analytics selection is required.");
  }
  var updatedIntent = resultHelpers.addContextValue(intent, "dashboardAnalyticsRangeResult", {
    period: intent.payload.period,
    granularity: intent.payload.granularity
  });
  return resultHelpers.success(updatedIntent);
}

export default {
  processDashboardAnalyticsRange: processDashboardAnalyticsRange
};
