// ICF/Stages/Emitters/Invoices/emitArchiveInvoiceResult.js

import resultHelpers from "../../../engine/resultHelpers.js";

/**
 * Emits a predictable archive result.
 *
 * @param {Object} intent - Current Intent.
 * @returns {Object} Emit result.
 */
function emitArchiveInvoiceResult(intent) {
  if (!intent) {
    return resultHelpers.emitFailure("Intent is required.");
  }

  var archiveResult = getArchiveResult(intent);
  var updatedIntent = resultHelpers.addResultDataToIntent(intent, {
    invoiceId: archiveResult.invoiceId,
    previousStatus: archiveResult.previousStatus,
    status: archiveResult.status,
    message: "Invoice archived successfully."
  });

  updatedIntent = resultHelpers.addEventToIntent(
    updatedIntent,
    resultHelpers.createEvent(
      "ArchiveInvoiceIntentCompleted",
      {
        invoiceId: archiveResult.invoiceId,
        previousStatus: archiveResult.previousStatus,
        status: archiveResult.status
      }
    )
  );

  return resultHelpers.success(updatedIntent);
}

/**
 * Reads archive result context safely.
 *
 * @param {Object} intent - Current Intent.
 * @returns {Object} Archive result data.
 */
function getArchiveResult(intent) {
  if (!intent.context) {
    return {
      invoiceId: "",
      previousStatus: "open",
      status: "archived"
    };
  }

  if (!intent.context.archiveResult) {
    return {
      invoiceId: "",
      previousStatus: "open",
      status: "archived"
    };
  }

  return intent.context.archiveResult;
}

export default {
  emitArchiveInvoiceResult: emitArchiveInvoiceResult
};
