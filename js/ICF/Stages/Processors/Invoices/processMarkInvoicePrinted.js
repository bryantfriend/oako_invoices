import { getCanonicalInvoiceStatus } from "../../../../core/invoiceWorkflow.js";
import resultHelpers from "../../../engine/resultHelpers.js";

async function processMarkInvoicePrinted(intent) {
  var context = intent && intent.context ? intent.context : {};
  var printApi = context.printApi;
  if (!printApi || typeof printApi.updateOrder !== "function" || typeof printApi.updateInvoice !== "function") {
    return resultHelpers.processFailure("Print status update service is required.");
  }

  var printedAt = new Date();
  var orderPatch = {
    isPrinted: true,
    printedAt: printedAt
  };
  var invoicePatch = {
    isPrinted: true,
    printedAt: printedAt
  };
  var orderStatus = String(context.order.status || "").toLowerCase();
  var invoiceStatus = getCanonicalInvoiceStatus(context.invoice.status);

  if (orderStatus === "draft") {
    orderPatch.status = "confirmed";
  }
  if (invoiceStatus === "draft" || invoiceStatus === "submitted") {
    invoicePatch.status = "approved";
    invoiceStatus = "approved";
  }

  await printApi.updateOrder(intent.payload.orderId, orderPatch);
  await printApi.updateInvoice(intent.payload.invoiceId, invoicePatch);

  if (!context.order.isPrinted && typeof printApi.awardPrintedInvoice === "function") {
    try {
      await printApi.awardPrintedInvoice();
    } catch (error) {
      console.warn("Printed invoice status was saved, but the reward could not be recorded.", error);
    }
  }

  var updatedIntent = resultHelpers.addContextValue(intent, "markInvoicePrintedResult", {
    invoiceId: intent.payload.invoiceId,
    orderId: intent.payload.orderId,
    invoiceStatus: invoiceStatus,
    orderStatus: orderPatch.status || orderStatus,
    invoicePatch: invoicePatch,
    orderPatch: orderPatch
  });
  return resultHelpers.success(updatedIntent);
}

export default {
  processMarkInvoicePrinted: processMarkInvoicePrinted
};
