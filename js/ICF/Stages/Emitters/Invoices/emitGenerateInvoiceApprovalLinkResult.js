// ICF/Stages/Emitters/Invoices/emitGenerateInvoiceApprovalLinkResult.js

function emitGenerateInvoiceApprovalLinkResult(intent) {
  var context = intent.context || {};

  return {
    ok: true,
    intent: Object.assign({}, intent, {
      context: Object.assign({}, context, {
        events: [
          {
            type: "invoiceApprovalLinkGenerated",
            invoiceId: intent.payload.invoiceId
          }
        ],
        resultMessage: "Approval link generated."
      })
    })
  };
}

export default {
  emitGenerateInvoiceApprovalLinkResult: emitGenerateInvoiceApprovalLinkResult
};
