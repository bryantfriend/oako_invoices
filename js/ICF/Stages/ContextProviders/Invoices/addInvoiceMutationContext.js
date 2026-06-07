import addArchiveInvoiceContextModule from "./addArchiveInvoiceContext.js";

function addInvoiceMutationContext(intent) {
  return addArchiveInvoiceContextModule.addArchiveInvoiceContext(intent);
}

export default {
  addInvoiceMutationContext: addInvoiceMutationContext
};
