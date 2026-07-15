import resultHelpers from "../../../engine/resultHelpers.js";

function emitQuickPrintSelectedInvoicesResult(intent) {
  var printResult = intent && intent.context ? intent.context.quickPrintResult : null;
  if (!printResult) {
    return resultHelpers.emitFailure("The combined PDF result is missing.");
  }
  var updatedIntent = resultHelpers.addResultDataToIntent(intent, printResult);
  updatedIntent = resultHelpers.addEventToIntent(updatedIntent, {
    type: "combinedInvoicePdfPrepared",
    invoiceCount: printResult.invoiceCount,
    layout: printResult.layout,
    durationMs: printResult.durationMs
  });
  return resultHelpers.success(updatedIntent);
}

export default {
  emitQuickPrintSelectedInvoicesResult: emitQuickPrintSelectedInvoicesResult
};
