// ICF/Stages/Validators/Invoices/validateGenerateInvoiceApprovalLinkPayload.js

function validateGenerateInvoiceApprovalLinkPayload(intent) {
  var errors = [];
  var payload = intent.payload || {};

  if (!payload.invoiceId || typeof payload.invoiceId !== "string") {
    errors.push("Invoice ID is required.");
  }

  if (!payload.token || typeof payload.token !== "string") {
    errors.push("Approval token is required.");
  }

  if (payload.token && !/^[a-f0-9]{64}$/.test(payload.token)) {
    errors.push("Approval token must be a 64-character secure token.");
  }

  if (errors.length > 0) {
    return {
      ok: false,
      errors: errors
    };
  }

  return {
    ok: true,
    intent: intent
  };
}

export default {
  validateGenerateInvoiceApprovalLinkPayload: validateGenerateInvoiceApprovalLinkPayload
};
