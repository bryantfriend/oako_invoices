import resultHelpers from "../../../engine/resultHelpers.js";

function normalizeDashboardAnalyticsRangePayload(intent) {
  if (!intent || !intent.payload) {
    return resultHelpers.normalizationFailure("Intent payload is required.");
  }
  var period = intent.payload.period;
  if (period && typeof period === "object") {
    period = {
      start: String(period.start || "").trim(),
      end: String(period.end || "").trim()
    };
  } else {
    period = String(period || "all").trim().toLowerCase();
  }
  var updatedIntent = Object.assign({}, intent, {
    payload: Object.assign({}, intent.payload, {
      period: period,
      granularity: String(intent.payload.granularity || "day").trim().toLowerCase()
    })
  });
  return resultHelpers.success(updatedIntent);
}

export default {
  normalizeDashboardAnalyticsRangePayload: normalizeDashboardAnalyticsRangePayload
};
