import bulkInvoicePrintService from "../../../../services/bulkInvoicePrintService.js";
import resultHelpers from "../../../engine/resultHelpers.js";

async function processQuickPrintSelectedInvoices(intent) {
  var printResult = await bulkInvoicePrintService.generateCombinedPdf(
    intent.payload.orderIds,
    intent.payload.layout,
    intent.context,
    intent.context.printOptions
  );
  return resultHelpers.success(Object.assign({}, intent, {
    context: Object.assign({}, intent.context, {
      quickPrintResult: printResult
    })
  }));
}

export default {
  processQuickPrintSelectedInvoices: processQuickPrintSelectedInvoices
};
