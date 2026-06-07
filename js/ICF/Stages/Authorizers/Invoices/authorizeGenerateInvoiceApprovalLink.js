// ICF/Stages/Authorizers/Invoices/authorizeGenerateInvoiceApprovalLink.js

function authorizeGenerateInvoiceApprovalLink(intent) {
  var errors = [];
  var actor = intent.actor || {};
  var context = intent.context || {};

  if (actor.role !== "admin") {
    errors.push("Only admins can generate approval links.");
  }

  if (!context.invoice) {
    errors.push("Invoice not found.");
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
  authorizeGenerateInvoiceApprovalLink: authorizeGenerateInvoiceApprovalLink
};
