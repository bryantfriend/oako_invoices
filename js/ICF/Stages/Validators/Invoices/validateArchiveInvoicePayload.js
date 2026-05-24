// ICF/Stages/Validators/Invoices/validateArchiveInvoicePayload.js

import resultHelpers from "../../../engine/resultHelpers.js";

/**
 * Validates the payload for ArchiveInvoiceIntent.
 *
 * @param {Object} intent - Current Intent.
 * @returns {Object} Validation result.
 */
function validateArchiveInvoicePayload(intent) {
  var errors = [];

  if (!intent) {
    return resultHelpers.validationFailure("Intent is required.");
  }

  if (!intent.payload) {
    return resultHelpers.validationFailure("Intent payload is required.");
  }

  if (!intent.payload.invoiceId) {
    errors.push(resultHelpers.missingField("payload.invoiceId"));
  } else if (typeof intent.payload.invoiceId !== "string") {
    errors.push("Invalid field: payload.invoiceId must be a string.");
  } else if (intent.payload.invoiceId.trim() === "") {
    errors.push("Invalid field: payload.invoiceId must not be empty.");
  }

  if (errors.length > 0) {
    return resultHelpers.validationFailure(errors);
  }

  return resultHelpers.success(intent);
}

export default {
  validateArchiveInvoicePayload: validateArchiveInvoicePayload
};
