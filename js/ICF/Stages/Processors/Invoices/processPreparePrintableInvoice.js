import resultHelpers from "../../../engine/resultHelpers.js";

async function processPreparePrintableInvoice(intent) {
  var preparationResult = await intent.context.invoiceApi(
    intent.payload.orderId,
    intent.context.orderSnapshot,
    intent.context.generationOptions
  );
  return resultHelpers.success(Object.assign({}, intent, {
    context: Object.assign({}, intent.context, {
      printableInvoiceResult: preparationResult
    })
  }));
}

export default {
  processPreparePrintableInvoice: processPreparePrintableInvoice
};
