// ICF/Stages/Emitters/Invoices/emitSubmitInvoiceApprovalResponseResult.js

function emitSubmitInvoiceApprovalResponseResult(intent) {
  var context = intent.context || {};
  var response = context.response || {};

  return {
    ok: true,
    intent: Object.assign({}, intent, {
      context: Object.assign({}, context, {
        events: [
          {
            type: "invoiceApprovalResponse",
            invoiceId: context.approvalLink.invoiceId,
            responseType: response.responseType
          }
        ],
        resultMessage: "Approval response submitted."
      })
    })
  };
}

export default {
  emitSubmitInvoiceApprovalResponseResult: emitSubmitInvoiceApprovalResponseResult
};
