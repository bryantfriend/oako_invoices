import resultHelpers from "../../../engine/resultHelpers.js";

function emitMarkInvoicePrintedResult(intent) {
  var result = intent && intent.context ? intent.context.markInvoicePrintedResult : null;
  if (!result) {
    return resultHelpers.emitFailure("Printed invoice result is missing.");
  }
  var updatedIntent = resultHelpers.addResultDataToIntent(intent, result);
  updatedIntent = resultHelpers.addEventToIntent(updatedIntent, {
    type: "InvoiceMarkedPrinted",
    invoiceId: result.invoiceId,
    orderId: result.orderId,
    invoiceStatus: result.invoiceStatus,
    createdAt: Date.now()
  });
  return resultHelpers.success(updatedIntent);
}

export default {
  emitMarkInvoicePrintedResult: emitMarkInvoicePrintedResult
};
