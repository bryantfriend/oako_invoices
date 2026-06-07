// ICF/Stages/Validators/Invoices/validateSubmitInvoiceApprovalResponsePayload.js

function validateSubmitInvoiceApprovalResponsePayload(intent) {
  var errors = [];
  var payload = intent.payload || {};

  if (!payload.token || typeof payload.token !== "string") {
    errors.push("Approval token is required.");
  }

  if (payload.responseType !== "accepted" && payload.responseType !== "modified") {
    errors.push("Response type must be accepted or modified.");
  }

  if (payload.responseType === "modified" && !Array.isArray(payload.modifiedItems)) {
    errors.push("Modified items are required when requesting changes.");
  }

  if (payload.notes && typeof payload.notes !== "string") {
    errors.push("Notes must be text.");
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
  validateSubmitInvoiceApprovalResponsePayload: validateSubmitInvoiceApprovalResponsePayload
};
