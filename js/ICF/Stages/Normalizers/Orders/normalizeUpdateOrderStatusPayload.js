// ICF/Stages/Normalizers/Orders/normalizeUpdateOrderStatusPayload.js

import resultHelpers from "../../../engine/resultHelpers.js";

/**
 * Normalizes order status payload values before authorization and processing.
 *
 * @param {Object} intent - Current Intent.
 * @returns {Object} Normalization result.
 */
function normalizeUpdateOrderStatusPayload(intent) {
  if (!intent || !intent.payload) {
    return resultHelpers.normalizationFailure("Intent payload is required.");
  }

  var updatedIntent = Object.assign({}, intent, {
    payload: Object.assign({}, intent.payload, {
      orderId: String(intent.payload.orderId || "").trim(),
      status: String(intent.payload.status || "").trim().toLowerCase()
    })
  });

  return resultHelpers.success(updatedIntent);
}

export default {
  normalizeUpdateOrderStatusPayload: normalizeUpdateOrderStatusPayload
};
