// ICF/Stages/Processors/Invoices/processSubmitInvoiceApprovalResponse.js

import { invoiceApprovalService } from "../../../../services/invoiceApprovalService.js";

function buildCustomerChanges(payload) {
  if (payload.responseType !== "modified") {
    return null;
  }

  return {
    notes: payload.notes || "",
    modifiedItems: payload.modifiedItems || []
  };
}

async function processSubmitInvoiceApprovalResponse(intent) {
  var payload = intent.payload || {};
  var context = intent.context || {};
  var customerChanges = buildCustomerChanges(payload);
  var response = await invoiceApprovalService.saveCustomerResponse(
    context.approvalLink,
    payload.responseType,
    customerChanges
  );

  return {
    ok: true,
    intent: Object.assign({}, intent, {
      context: Object.assign({}, context, {
        response: response,
        resultData: {
          invoiceId: context.approvalLink.invoiceId,
          responseType: response.responseType,
          customerChanges: response.customerChanges,
          responseSubmittedAt: response.responseSubmittedAt
        }
      })
    })
  };
}

export default {
  processSubmitInvoiceApprovalResponse: processSubmitInvoiceApprovalResponse
};
