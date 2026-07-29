import resultHelpers from "../../../engine/resultHelpers.js";

function emitPreparePrintableInvoiceResult(intent) {
  var preparationResult = intent && intent.context ? intent.context.printableInvoiceResult : null;
  if (!preparationResult || !preparationResult.invoiceId) {
    return resultHelpers.emitFailure("The printable invoice result is missing.");
  }
  var updatedIntent = resultHelpers.addResultDataToIntent(intent, preparationResult);
  updatedIntent = resultHelpers.addEventToIntent(updatedIntent, {
    type: "PrintableInvoicePrepared",
    invoiceId: preparationResult.invoiceId,
    created: preparationResult.created === true
  });
  return resultHelpers.success(updatedIntent);
}

export default {
  emitPreparePrintableInvoiceResult: emitPreparePrintableInvoiceResult
};
