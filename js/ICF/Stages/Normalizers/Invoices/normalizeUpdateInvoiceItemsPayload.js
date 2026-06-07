import resultHelpers from "../../../engine/resultHelpers.js";
import { normalizeInvoiceItemsForEditing, recalculateInvoiceTotals } from "../../Processors/Invoices/invoiceEditHelpers.js";

function normalizeUpdateInvoiceItemsPayload(intent) {
  var payload = intent && intent.payload ? intent.payload : {};
  var invoice = recalculateInvoiceTotals({
    taxRate: payload.taxRate,
    discountType: payload.discountType,
    discountValue: payload.discountValue,
    discountAmount: payload.discountAmount,
    totalWeight: payload.totalWeight,
    items: payload.items || []
  });

  var normalizedPayload = Object.assign({}, payload, {
    invoiceId: String(payload.invoiceId || "").trim(),
    items: normalizeInvoiceItemsForEditing(invoice),
    totals: {
      subtotal: invoice.subtotal,
      taxAmount: invoice.taxAmount,
      discountAmount: invoice.discountAmount,
      totalAmount: invoice.totalAmount,
      totalWeight: invoice.totalWeight
    }
  });

  return resultHelpers.success(resultHelpers.replacePayload(intent, normalizedPayload));
}

export default {
  normalizeUpdateInvoiceItemsPayload: normalizeUpdateInvoiceItemsPayload
};
