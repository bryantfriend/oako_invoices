import resultHelpers from "../../../engine/resultHelpers.js";
import { safeNumber } from "../../Processors/Invoices/invoiceEditHelpers.js";

function normalizeRecordInvoiceReturnPayload(intent) {
  var payload = intent && intent.payload ? intent.payload : {};
  var items = (payload.items || []).map(function(item) {
    return {
      lineItemId: String(item.lineItemId || "").trim(),
      productId: String(item.productId || "").trim(),
      returnedQuantity: safeNumber(item.returnedQuantity, 0)
    };
  }).filter(function(item) {
    return item.returnedQuantity > 0;
  });

  var normalizedPayload = Object.assign({}, payload, {
    invoiceId: String(payload.invoiceId || "").trim(),
    note: String(payload.note || "").trim(),
    items: items
  });

  return resultHelpers.success(resultHelpers.replacePayload(intent, normalizedPayload));
}

export default {
  normalizeRecordInvoiceReturnPayload: normalizeRecordInvoiceReturnPayload
};
