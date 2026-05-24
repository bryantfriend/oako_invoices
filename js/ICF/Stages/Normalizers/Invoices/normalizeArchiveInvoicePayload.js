// ICF/Stages/Normalizers/Invoices/normalizeArchiveInvoicePayload.js

import resultHelpers from "../../../engine/resultHelpers.js";

/**
 * Normalizes ArchiveInvoiceIntent payload values.
 *
 * @param {Object} intent - Current Intent.
 * @returns {Object} Normalization result.
 */
function normalizeArchiveInvoicePayload(intent) {
  if (!intent) {
    return resultHelpers.normalizationFailure("Intent is required.");
  }

  if (!intent.payload) {
    return resultHelpers.normalizationFailure("Intent payload is required.");
  }

  var normalizedPayload = Object.assign({}, intent.payload, {
    invoiceId: String(intent.payload.invoiceId || "").trim()
  });

  var updatedIntent = resultHelpers.replacePayload(intent, normalizedPayload);

  return resultHelpers.success(updatedIntent);
}

export default {
  normalizeArchiveInvoicePayload: normalizeArchiveInvoicePayload
};
