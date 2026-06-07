import {
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { deviceIdService } from "../../../../services/deviceIdService.js";
import { dataIntegrityService } from "../../../../services/dataIntegrityService.js";
import {
  canEditInvoiceItems,
  getInvoiceWorkflowLockMessage
} from "../../../../core/invoiceWorkflow.js";
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
  if (!isInvoiceItemsEditable(invoice)) {
    return resultHelpers.processFailure(getInvoiceWorkflowLockMessage(invoice));
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
  if (mergedInvoice.returnSummary !== undefined) {
    updatePayload.returnSummary = mergedInvoice.returnSummary;
  }

  await dataIntegrityService.updateInvoiceWithIntegrity(
    intent.context.invoiceRef,
    invoice,
    updatePayload,
    {
      action: "update",
      actor: intent.actor,
      source: intent.meta && intent.meta.source ? intent.meta.source : "ui"
    }
  );

  var updatedIntent = resultHelpers.addContextValue(intent, "invoiceItemsResult", {
    invoiceId: intent.payload.invoiceId,
    itemCount: mergedInvoice.items.length,
    subtotal: mergedInvoice.subtotal,
    totalAmount: mergedInvoice.totalAmount
  });

  return resultHelpers.success(updatedIntent);
}

function isInvoiceItemsEditable(invoice) {
  return canEditInvoiceItems(invoice);
}

export default {
  processUpdateInvoiceItems: processUpdateInvoiceItems
};
