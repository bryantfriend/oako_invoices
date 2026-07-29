import resultHelpers from "../../../engine/resultHelpers.js";

function normalizeArchiveSelectedOrdersPayload(intent) {
  if (!intent || !intent.payload) {
    return resultHelpers.normalizationFailure("Intent payload is required.");
  }
  var normalizedIds = [];
  var sourceIds = Array.isArray(intent.payload.orderIds) ? intent.payload.orderIds : [];
  var index = 0;
  while (index < sourceIds.length) {
    var orderId = String(sourceIds[index] || "").trim();
    if (orderId && normalizedIds.indexOf(orderId) === -1) {
      normalizedIds.push(orderId);
    }
    index = index + 1;
  }
  var updatedIntent = Object.assign({}, intent, {
    payload: Object.assign({}, intent.payload, {
      orderIds: normalizedIds
    })
  });
  return resultHelpers.success(updatedIntent);
}

export default {
  normalizeArchiveSelectedOrdersPayload: normalizeArchiveSelectedOrdersPayload
};
