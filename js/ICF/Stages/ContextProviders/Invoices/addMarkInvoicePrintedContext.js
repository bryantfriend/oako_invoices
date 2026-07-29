import { auth } from "../../../../core/firebase.js";
import resultHelpers from "../../../engine/resultHelpers.js";

async function addMarkInvoicePrintedContext(intent) {
  var privateOptions = intent && intent.privateOptions ? intent.privateOptions : {};
  var printApi = privateOptions.printApi;
  if (!printApi || typeof printApi.getInvoice !== "function" || typeof printApi.getOrder !== "function") {
    return resultHelpers.contextFailure("Print status service is required.");
  }
  var invoice = await printApi.getInvoice(intent.payload.invoiceId);
  var order = await printApi.getOrder(intent.payload.orderId);
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
