import { auth } from "../../../../core/firebase.js";
import resultHelpers from "../../../engine/resultHelpers.js";

async function addMarkInvoicePrintedContext(intent) {
  var privateOptions = intent && intent.privateOptions ? intent.privateOptions : {};
  var printApi = privateOptions.printApi;
  if (!printApi || typeof printApi.getInvoice !== "function" || typeof printApi.getOrder !== "function") {
    return resultHelpers.contextFailure("Print status service is required.");
  }
  var invoice;
  var order;
  try {
    invoice = await printApi.getInvoice(intent.payload.invoiceId);
    order = await printApi.getOrder(intent.payload.orderId);
  } catch (error) {
    console.warn("Could not load trusted post-print context.", error);
    return resultHelpers.contextFailure("The invoice was printed, but its status could not be saved yet. Check your connection and try Mark as Printed again.");
  }
  var updatedIntent = resultHelpers.addContextValues(intent, {
    currentUser: auth.currentUser,
    invoice: invoice,
    order: order,
    printApi: printApi
  });
  return resultHelpers.success(updatedIntent);
}

export default {
  addMarkInvoicePrintedContext: addMarkInvoicePrintedContext
};
