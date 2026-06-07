// ICF/Stages/Normalizers/Invoices/normalizeGenerateInvoiceApprovalLinkPayload.js

function normalizeGenerateInvoiceApprovalLinkPayload(intent) {
  var payload = intent.payload || {};
  var nextPayload = Object.assign({}, payload, {
    invoiceId: String(payload.invoiceId || "").trim(),
    token: String(payload.token || "").trim().toLowerCase()
  });

  return {
    ok: true,
    intent: Object.assign({}, intent, {
      payload: nextPayload
    })
  };
}

export default {
  normalizeGenerateInvoiceApprovalLinkPayload: normalizeGenerateInvoiceApprovalLinkPayload
};
