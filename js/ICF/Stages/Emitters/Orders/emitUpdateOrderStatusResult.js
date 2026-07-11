// ICF/Stages/Emitters/Orders/emitUpdateOrderStatusResult.js

import resultHelpers from "../../../engine/resultHelpers.js";

/**
 * Adds a normalized result payload for an order status update.
 *
 * @param {Object} intent - Current Intent.
 * @returns {Object} Emit result.
 */
function emitUpdateOrderStatusResult(intent) {
  if (!intent || !intent.context || !intent.context.updateOrderStatusResult) {
    return resultHelpers.emitFailure("Order status update result is missing.");
  }

  var result = intent.context.updateOrderStatusResult;
  var updatedIntent = resultHelpers.addResultDataToIntent(intent, {
    orderId: result.orderId,
    status: result.status,
    updateResult: result.updateResult
  });

  updatedIntent = resultHelpers.addEventToIntent(updatedIntent, {
    type: "OrderStatusUpdated",
    orderId: result.orderId,
    status: result.status,
    createdAt: Date.now()
  });

  return resultHelpers.success(updatedIntent);
}

export default {
  emitUpdateOrderStatusResult: emitUpdateOrderStatusResult
};
