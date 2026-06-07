import resultHelpers from "../../../engine/resultHelpers.js";

function validateRecordInvoiceReturnPayload(intent) {
  var errors = [];
  var payload = intent && intent.payload ? intent.payload : {};

  if (!payload.invoiceId || typeof payload.invoiceId !== "string") {
    errors.push("Invoice ID is required.");
  }

  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    errors.push("At least one returned item is required.");
  }

  if (errors.length > 0) {
    return resultHelpers.validationFailure(errors);
  }

  return resultHelpers.success(intent);
}

export default {
  validateRecordInvoiceReturnPayload: validateRecordInvoiceReturnPayload
};
