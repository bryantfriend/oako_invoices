// ICF/Stages/ContextProviders/Invoices/addSubmitInvoiceApprovalResponseContext.js

import { invoiceApprovalService } from "../../../../services/invoiceApprovalService.js";

async function addSubmitInvoiceApprovalResponseContext(intent) {
  var payload = intent.payload || {};
  var approvalLink = await invoiceApprovalService.getApprovalLinkByToken(payload.token);

  return {
    ok: true,
    intent: Object.assign({}, intent, {
      context: Object.assign({}, intent.context || {}, {
        approvalLink: approvalLink
      })
    })
  };
}

export default {
  addSubmitInvoiceApprovalResponseContext: addSubmitInvoiceApprovalResponseContext
};
