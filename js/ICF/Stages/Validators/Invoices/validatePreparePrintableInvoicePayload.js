import resultHelpers from "../../../engine/resultHelpers.js";

function validatePreparePrintableInvoicePayload(intent) {
  var orderId = intent && intent.payload ? intent.payload.orderId : "";
  if (typeof orderId !== "string" || !orderId.trim()) {
    return resultHelpers.validationFailure("Order ID is required to prepare an invoice.");
  }
  return resultHelpers.success(intent);
}

export default {
  validatePreparePrintableInvoicePayload: validatePreparePrintableInvoicePayload
};
