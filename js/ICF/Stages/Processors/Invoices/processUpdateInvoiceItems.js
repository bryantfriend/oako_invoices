import {
  serverTimestamp,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { deviceIdService } from "../../../../services/deviceIdService.js";
import resultHelpers from "../../../engine/resultHelpers.js";
import {
  recalculateInvoiceTotals,
  validateEditableItems
} from "./invoiceEditHelpers.js";

async function processUpdateInvoiceItems(intent) {
  if (!intent || !intent.context || !intent.context.invoice) {
    return resultHelpers.processFailure("Invoice not found.");
  }

  var invoice = intent.context.invoice;
  if (invoice.status !== "draft") {
    return resultHelpers.processFailure("Invoice items can only be edited in draft mode.");
  }

  var mergedInvoice = recalculateInvoiceTotals(Object.assign({}, invoice, {
    items: intent.payload.items
  }));
  var validationMessage = validateEditableItems(mergedInvoice.items);
  if (validationMessage) {
    return resultHelpers.processFailure(validationMessage);
  }

  var user = intent.context.currentUser;
  var deviceId = await deviceIdService.getDeviceId();
  var updatePayload = {
    items: mergedInvoice.items,
    subtotal: mergedInvoice.subtotal,
    taxAmount: mergedInvoice.taxAmount,
    discountAmount: mergedInvoice.discountAmount,
    totalAmount: mergedInvoice.totalAmount,
    updatedAt: serverTimestamp(),
    updatedBy: user ? user.uid : "",
    deviceId: deviceId,
    localUpdatedAt: new Date().toISOString(),
    syncState: "synced"
  };

  if (mergedInvoice.totalWeight !== undefined) {
    updatePayload.totalWeight = mergedInvoice.totalWeight;
  }

  await updateDoc(intent.context.invoiceRef, updatePayload);

  var updatedIntent = resultHelpers.addContextValue(intent, "invoiceItemsResult", {
    invoiceId: intent.payload.invoiceId,
    itemCount: mergedInvoice.items.length,
    subtotal: mergedInvoice.subtotal,
    totalAmount: mergedInvoice.totalAmount
  });

  return resultHelpers.success(updatedIntent);
}

export default {
  processUpdateInvoiceItems: processUpdateInvoiceItems
};
