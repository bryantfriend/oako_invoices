// ICF/Stages/Processors/Orders/processUpdateOrderStatus.js

import resultHelpers from "../../../engine/resultHelpers.js";

/**
 * Performs the order status update through the service API supplied by the intent.
 *
 * @param {Object} intent - Current Intent.
 * @returns {Object} Process result.
 */
async function processUpdateOrderStatus(intent) {
  if (!intent || !intent.payload) {
    return resultHelpers.processFailure("Intent payload is required.");
  }

  var orderApi = intent.payload.orderApi;

  if (!orderApi || typeof orderApi.updateOrderStatusDirect !== "function") {
    return resultHelpers.processFailure("Order status update service is required.");
  }

  var updateResult = await orderApi.updateOrderStatusDirect(
    intent.payload.orderId,
    intent.payload.status
  );

  var updatedIntent = resultHelpers.addContextValue(
    intent,
    "updateOrderStatusResult",
    {
      orderId: intent.payload.orderId,
      status: intent.payload.status,
      updateResult: updateResult
    }
  );

  return resultHelpers.success(updatedIntent);
}

export default {
  processUpdateOrderStatus: processUpdateOrderStatus
};
