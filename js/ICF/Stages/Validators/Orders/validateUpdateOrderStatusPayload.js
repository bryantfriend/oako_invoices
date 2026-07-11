// ICF/Stages/Validators/Orders/validateUpdateOrderStatusPayload.js

import resultHelpers from "../../../engine/resultHelpers.js";

var ALLOWED_STATUSES = [
  "draft",
  "pending",
  "confirmed",
  "partially_returned",
  "returned",
  "fully_returned",
  "fulfilled",
  "paid",
  "cancelled",
  "archived"
];

/**
 * Validates the payload for changing an order status.
 *
 * @param {Object} intent - Current Intent.
 * @returns {Object} Validation result.
 */
function validateUpdateOrderStatusPayload(intent) {
  var errors = [];
  var payload = intent && intent.payload ? intent.payload : {};

  if (!payload.orderId || typeof payload.orderId !== "string") {
    errors.push("Order ID is required.");
  }

  if (!payload.status || typeof payload.status !== "string") {
    errors.push("Order status is required.");
  }

  var normalizedStatus = typeof payload.status === "string" ? payload.status.trim().toLowerCase() : "";

  if (normalizedStatus && ALLOWED_STATUSES.indexOf(normalizedStatus) === -1) {
    errors.push("Order status is not supported.");
  }

  if (!payload.orderApi || typeof payload.orderApi.updateOrderStatusDirect !== "function") {
    errors.push("Order status update service is required.");
  }

  if (errors.length > 0) {
    return resultHelpers.validationFailure(errors);
  }

  return resultHelpers.success(intent);
}

export default {
  validateUpdateOrderStatusPayload: validateUpdateOrderStatusPayload
};