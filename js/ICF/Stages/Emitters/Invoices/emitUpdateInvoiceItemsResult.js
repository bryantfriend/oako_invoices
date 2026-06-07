import resultHelpers from "../../../engine/resultHelpers.js";

function emitUpdateInvoiceItemsResult(intent) {
  var data = intent && intent.context && intent.context.invoiceItemsResult
    ? intent.context.invoiceItemsResult
    : {};

  return resultHelpers.successWithData(intent, {
    ok: true,
    message: "Invoice items updated.",
    data: data
  });
}

export default {
  emitUpdateInvoiceItemsResult: emitUpdateInvoiceItemsResult
};
