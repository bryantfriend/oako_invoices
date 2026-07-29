import resultHelpers from "../../../engine/resultHelpers.js";

function normalizePreparePrintableInvoicePayload(intent) {
  var payload = Object.assign({}, intent.payload || {}, {
    orderId: String(intent.payload.orderId || "").trim()
  });
  return resultHelpers.success(Object.assign({}, intent, {
    payload: payload
  }));
}

export default {
  normalizePreparePrintableInvoicePayload: normalizePreparePrintableInvoicePayload
};
