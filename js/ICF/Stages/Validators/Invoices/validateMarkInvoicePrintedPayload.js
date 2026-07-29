import resultHelpers from "../../../engine/resultHelpers.js";

function validateMarkInvoicePrintedPayload(intent) {
  var payload = intent && intent.payload ? intent.payload : {};
  var errors = [];
  if (!payload.invoiceId || typeof payload.invoiceId !== "string") {
    errors.push("Invoice ID is required.");
  }
  if (!payload.orderId || typeof payload.orderId !== "string") {
    errors.push("Order ID is required.");
  }
  if (errors.length > 0) {
    return resultHelpers.validationFailure(errors);
  }
  return resultHelpers.success(intent);
}

export default {
  validateMarkInvoicePrintedPayload: validateMarkInvoicePrintedPayload
};
