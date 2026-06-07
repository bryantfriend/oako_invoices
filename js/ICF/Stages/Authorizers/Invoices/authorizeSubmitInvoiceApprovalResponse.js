// ICF/Stages/Authorizers/Invoices/authorizeSubmitInvoiceApprovalResponse.js

import { invoiceApprovalService } from "../../../../services/invoiceApprovalService.js";

function authorizeSubmitInvoiceApprovalResponse(intent) {
  var approvalLink = intent.context ? intent.context.approvalLink : null;

  if (!approvalLink) {
    return {
      ok: false,
      errors: [
        "This approval link has expired."
      ]
    };
  }

  if (invoiceApprovalService.isApprovalLinkExpired(approvalLink)) {
    return {
      ok: false,
      errors: [
        "This approval link has expired."
      ]
    };
  }

  if (approvalLink.status !== "pending") {
    return {
      ok: false,
      errors: [
        "This approval response has already been submitted."
      ]
    };
  }

  return {
    ok: true,
    intent: intent
  };
}

export default {
  authorizeSubmitInvoiceApprovalResponse: authorizeSubmitInvoiceApprovalResponse
};
