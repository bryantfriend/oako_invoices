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
    archived: archiveResult.archived,
    transitioned: archiveResult.transitioned,
    status: archiveResult.status,
    message: "Invoice archived successfully."
  });

  updatedIntent = resultHelpers.addEventToIntent(
    updatedIntent,
    resultHelpers.createEvent(
      "ArchiveInvoiceIntentCompleted",
      {
        invoiceId: archiveResult.invoiceId,
        archived: archiveResult.archived,
        transitioned: archiveResult.transitioned,
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
      archived: true,
      transitioned: false,
      status: "open"
    };
  }

  if (!intent.context.archiveResult) {
    return {
      invoiceId: "",
      archived: true,
      transitioned: false,
      status: "open"
    };
  }

  return intent.context.archiveResult;
}

export default {
  emitArchiveInvoiceResult: emitArchiveInvoiceResult
};
