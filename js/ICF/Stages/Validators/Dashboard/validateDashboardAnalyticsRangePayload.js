import resultHelpers from "../../../engine/resultHelpers.js";

var PERIODS = ["today", "7d", "30d", "90d", "180d", "365d", "all"];
var GRANULARITIES = ["day", "week", "month"];

function validateDashboardAnalyticsRangePayload(intent) {
  var payload = intent && intent.payload ? intent.payload : {};
  var errors = [];
  var period = payload.period;
  if (period && typeof period === "object") {
    if (!period.start || !period.end) {
      errors.push("Custom analytics dates require a start and end date.");
    } else if (String(period.start) > String(period.end)) {
      errors.push("The analytics start date must be before the end date.");
    }
  } else if (PERIODS.indexOf(String(period || "").toLowerCase()) === -1) {
    errors.push("Analytics time frame is not supported.");
  }
  if (GRANULARITIES.indexOf(String(payload.granularity || "").toLowerCase()) === -1) {
    errors.push("Analytics grouping must be day, week, or month.");
  }
  if (errors.length > 0) {
    return resultHelpers.validationFailure(errors);
  }
  return resultHelpers.success(intent);
}

export default {
  validateDashboardAnalyticsRangePayload: validateDashboardAnalyticsRangePayload
};
