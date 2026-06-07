// ICF/Stages/Normalizers/Invoices/normalizeSubmitInvoiceApprovalResponsePayload.js

function normalizeModifiedItems(items) {
  var normalizedItems = [];
  var index = 0;

  while (index < items.length) {
    var item = items[index] || {};
    normalizedItems.push({
      productId: String(item.productId || "").trim(),
      name: String(item.name || "Product").trim(),
      originalQuantity: Math.max(0, Number(item.originalQuantity) || 0),
      requestedQuantity: Math.max(0, Number(item.requestedQuantity) || 0)
    });
    index = index + 1;
  }

  return normalizedItems;
}

function normalizeSubmitInvoiceApprovalResponsePayload(intent) {
  var payload = intent.payload || {};
  var modifiedItems = Array.isArray(payload.modifiedItems) ? payload.modifiedItems : [];
  var nextPayload = Object.assign({}, payload, {
    token: String(payload.token || "").trim(),
    responseType: String(payload.responseType || "").trim(),
    notes: String(payload.notes || "").trim(),
    modifiedItems: normalizeModifiedItems(modifiedItems)
  });

  return {
    ok: true,
    intent: Object.assign({}, intent, {
      payload: nextPayload
    })
  };
}

export default {
  normalizeSubmitInvoiceApprovalResponsePayload: normalizeSubmitInvoiceApprovalResponsePayload
};
