import resultHelpers from "../../../engine/resultHelpers.js";

function validateArchiveSelectedOrdersPayload(intent) {
  var payload = intent && intent.payload ? intent.payload : {};
  var errors = [];
  if (!Array.isArray(payload.orderIds) || payload.orderIds.length === 0) {
    errors.push("Select at least one order to archive.");
  }
  if (Array.isArray(payload.orderIds)) {
    var index = 0;
    while (index < payload.orderIds.length) {
      if (typeof payload.orderIds[index] !== "string" || !payload.orderIds[index].trim()) {
        errors.push("Every selected order ID must be a non-empty string.");
        break;
      }
      index = index + 1;
    }
  }
  if (errors.length > 0) {
    return resultHelpers.validationFailure(errors);
  }
  return resultHelpers.success(intent);
}

export default {
  validateArchiveSelectedOrdersPayload: validateArchiveSelectedOrdersPayload
};
