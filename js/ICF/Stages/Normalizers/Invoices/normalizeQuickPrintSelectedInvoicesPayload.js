import resultHelpers from "../../../engine/resultHelpers.js";

function normalizeQuickPrintSelectedInvoicesPayload(intent) {
  var sourceIds = intent && intent.payload && Array.isArray(intent.payload.orderIds) ? intent.payload.orderIds : [];
  var orderIds = [];
  var index = 0;
  while (index < sourceIds.length) {
    var orderId = String(sourceIds[index] || "").trim();
    if (orderId && orderIds.indexOf(orderId) === -1) {
      orderIds.push(orderId);
    }
    index = index + 1;
  }
  var layout = String(intent.payload.layout || "").trim().toLowerCase();
  if (layout === "2-up" || layout === "two_up_portrait") {
    layout = "two-up-portrait";
  }
  return resultHelpers.success(Object.assign({}, intent, {
    payload: {
      orderIds: orderIds,
      layout: layout
    }
  }));
}

export default {
  normalizeQuickPrintSelectedInvoicesPayload: normalizeQuickPrintSelectedInvoicesPayload
};
