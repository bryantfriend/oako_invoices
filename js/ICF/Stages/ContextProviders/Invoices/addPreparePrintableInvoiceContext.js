import { auth } from "../../../../core/firebase.js";
import resultHelpers from "../../../engine/resultHelpers.js";

function addPreparePrintableInvoiceContext(intent) {
  var privateOptions = intent.privateOptions || {};
  var context = Object.assign({}, intent.context || {}, {
    currentUser: auth.currentUser,
    invoiceApi: privateOptions.invoiceApi || null,
    orderSnapshot: privateOptions.orderSnapshot || null,
    generationOptions: privateOptions.generationOptions || {}
  });
  return resultHelpers.success(Object.assign({}, intent, {
    context: context
  }));
}

export default {
  addPreparePrintableInvoiceContext: addPreparePrintableInvoiceContext
};
