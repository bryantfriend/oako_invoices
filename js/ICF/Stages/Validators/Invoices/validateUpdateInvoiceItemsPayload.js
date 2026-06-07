import resultHelpers from "../../../engine/resultHelpers.js";

function validateUpdateInvoiceItemsPayload(intent) {
  var errors = [];
  var payload = intent && intent.payload ? intent.payload : {};

  if (!payload.invoiceId || typeof payload.invoiceId !== "string") {
    errors.push("Invoice ID is required.");
  }

  if (!Array.isArray(payload.items)) {
    errors.push("Invoice items are required.");
  } else if (payload.items.length === 0) {
    errors.push("Invoice must have at least one item.");
  }

  if (errors.length > 0) {
    return resultHelpers.validationFailure(errors);
  }

  return resultHelpers.success(intent);
}

export default {
  validateUpdateInvoiceItemsPayload: validateUpdateInvoiceItemsPayload
};
