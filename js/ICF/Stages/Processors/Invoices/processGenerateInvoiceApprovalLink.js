// ICF/Stages/Processors/Invoices/processGenerateInvoiceApprovalLink.js

import { invoiceApprovalService } from "../../../../services/invoiceApprovalService.js";

async function processGenerateInvoiceApprovalLink(intent) {
  var payload = intent.payload || {};
  var context = intent.context || {};
  var approvalLink = await invoiceApprovalService.createApprovalLink(
    context.invoice,
    payload.token,
    context.expirationHours
  );

  return {
    ok: true,
    intent: Object.assign({}, intent, {
      context: Object.assign({}, context, {
        approvalLink: approvalLink,
        resultData: {
          approvalLink: approvalLink,
          approvalUrl: approvalLink.approvalUrl
        }
      })
    })
  };
}

export default {
  processGenerateInvoiceApprovalLink: processGenerateInvoiceApprovalLink
};
