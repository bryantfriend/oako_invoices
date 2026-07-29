import resultHelpers from "../../../engine/resultHelpers.js";

function normalizeMarkInvoicePrintedPayload(intent) {
  if (!intent || !intent.payload) {
    return resultHelpers.normalizationFailure("Intent payload is required.");
  }
  var updatedIntent = Object.assign({}, intent, {
    payload: Object.assign({}, intent.payload, {
      invoiceId: String(intent.payload.invoiceId || "").trim(),
      orderId: String(intent.payload.orderId || "").trim()
    })
  });
  return resultHelpers.success(updatedIntent);
}

export default {
  normalizeMarkInvoicePrintedPayload: normalizeMarkInvoicePrintedPayload
};
