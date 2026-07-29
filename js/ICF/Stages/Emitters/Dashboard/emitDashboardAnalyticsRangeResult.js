import resultHelpers from "../../../engine/resultHelpers.js";

function emitDashboardAnalyticsRangeResult(intent) {
  var result = intent && intent.context ? intent.context.dashboardAnalyticsRangeResult : null;
  if (!result) {
    return resultHelpers.emitFailure("Analytics selection result is missing.");
  }
  var updatedIntent = resultHelpers.addResultDataToIntent(intent, result);
  updatedIntent = resultHelpers.addEventToIntent(updatedIntent, {
    type: "DashboardAnalyticsRangeSelected",
    period: result.period,
    granularity: result.granularity,
    createdAt: Date.now()
  });
  return resultHelpers.success(updatedIntent);
}

export default {
  emitDashboardAnalyticsRangeResult: emitDashboardAnalyticsRangeResult
};
