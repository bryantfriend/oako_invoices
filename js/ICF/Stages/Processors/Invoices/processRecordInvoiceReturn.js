import {
  serverTimestamp,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { deviceIdService } from "../../../../services/deviceIdService.js";
import resultHelpers from "../../../engine/resultHelpers.js";
import {
  getInvoiceItemName,
  normalizeInvoiceItemsForEditing,
  safeNumber
} from "./invoiceEditHelpers.js";

async function processRecordInvoiceReturn(intent) {
  if (!intent || !intent.context || !intent.context.invoice) {
    return resultHelpers.processFailure("Invoice not found.");
  }

  var invoice = intent.context.invoice;
  var items = normalizeInvoiceItemsForEditing(invoice);
  var returnItems = buildReturnItems(items, intent.payload.items || []);

  if (returnItems.error) {
    return resultHelpers.processFailure(returnItems.error);
  }

  if (returnItems.items.length === 0) {
    return resultHelpers.processFailure("At least one item must have a return quantity greater than 0.");
  }

  var user = intent.context.currentUser;
  var actorName = getActorId(user);
  var deviceId = await deviceIdService.getDeviceId();
  var existingReturns = Array.isArray(invoice.returns) ? invoice.returns : [];
  var returnRecord = {
    returnId: makeReturnId(),
    createdAt: new Date(),
    createdBy: actorName,
    note: intent.payload.note || "",
    items: returnItems.items,
    totalReturnedQuantity: returnItems.totalReturnedQuantity,
    totalReturnedAmount: returnItems.totalReturnedAmount
  };
  var previousSummary = invoice.returnSummary || {};
  var updatePayload = {
    items: returnItems.updatedInvoiceItems,
    returns: existingReturns.concat([returnRecord]),
    returnSummary: {
      totalReturnedQuantity: safeNumber(previousSummary.totalReturnedQuantity, 0) + returnItems.totalReturnedQuantity,
      totalReturnedAmount: safeNumber(previousSummary.totalReturnedAmount, 0) + returnItems.totalReturnedAmount,
      lastReturnedAt: serverTimestamp()
    },
    status: "returned",
    updatedAt: serverTimestamp(),
    updatedBy: user ? user.uid : "",
    deviceId: deviceId,
    localUpdatedAt: new Date().toISOString(),
    syncState: "synced"
  };

  if (Array.isArray(invoice.statusHistory)) {
    updatePayload.statusHistory = invoice.statusHistory.concat([{
      status: "returned",
      changedAt: new Date(),
      changedBy: actorName,
      note: "Returned items recorded"
    }]);
  }

  await updateDoc(intent.context.invoiceRef, updatePayload);

  var updatedIntent = resultHelpers.addContextValue(intent, "returnResult", {
    invoiceId: intent.payload.invoiceId,
    returnId: returnRecord.returnId,
    totalReturnedQuantity: returnRecord.totalReturnedQuantity,
    totalReturnedAmount: returnRecord.totalReturnedAmount
  });

  return resultHelpers.success(updatedIntent);
}

function buildReturnItems(invoiceItems, requestedItems) {
  var updatedItems = invoiceItems.map(function(item) {
    return Object.assign({}, item);
  });
  var recordedItems = [];
  var totalReturnedQuantity = 0;
  var totalReturnedAmount = 0;

  for (var index = 0; index < requestedItems.length; index += 1) {
    var requestItem = requestedItems[index] || {};
    var quantity = safeNumber(requestItem.returnedQuantity, 0);
    if (quantity <= 0) {
      continue;
    }

    var itemIndex = updatedItems.findIndex(function(item) {
      return (requestItem.lineItemId && item.lineItemId === requestItem.lineItemId)
        || (requestItem.productId && item.productId === requestItem.productId);
    });

    if (itemIndex < 0) {
      return { error: "Returned item was not found on this invoice." };
    }

    var invoiceItem = updatedItems[itemIndex];
    var originalQuantity = safeNumber(invoiceItem.quantity, 0);
    var alreadyReturned = safeNumber(invoiceItem.returnedQuantity, 0);
    var remaining = originalQuantity - alreadyReturned;

    if (quantity > remaining) {
      return { error: "Return quantity cannot exceed remaining returnable quantity." };
    }

    var unitPrice = safeNumber(invoiceItem.price, 0);
    var returnAmount = unitPrice * quantity;
    invoiceItem.returnedQuantity = alreadyReturned + quantity;
    invoiceItem.returnedAmount = safeNumber(invoiceItem.returnedAmount, 0) + returnAmount;

    recordedItems.push({
      lineItemId: invoiceItem.lineItemId,
      productId: invoiceItem.productId || "",
      productName: getInvoiceItemName(invoiceItem),
      originalQuantity: originalQuantity,
      returnedQuantity: quantity,
      unitPrice: unitPrice,
      returnAmount: returnAmount
    });
    totalReturnedQuantity += quantity;
    totalReturnedAmount += returnAmount;
  }

  return {
    items: recordedItems,
    updatedInvoiceItems: updatedItems,
    totalReturnedQuantity: totalReturnedQuantity,
    totalReturnedAmount: totalReturnedAmount
  };
}

function makeReturnId() {
  return "ret-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

function getActorId(user) {
  if (!user) {
    return "";
  }
  return user.email || user.uid || "";
}

export default {
  processRecordInvoiceReturn: processRecordInvoiceReturn
};
