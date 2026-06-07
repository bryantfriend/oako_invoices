// ICF/Stages/ContextProviders/Invoices/addGenerateInvoiceApprovalLinkContext.js

import { invoiceService } from "../../../../services/invoiceService.js";
import { settingsService } from "../../../../services/settingsService.js";
import { invoiceApprovalService } from "../../../../services/invoiceApprovalService.js";

async function addGenerateInvoiceApprovalLinkContext(intent) {
  var payload = intent.payload || {};
  var invoice = await invoiceService.getInvoice(payload.invoiceId);
  var settings = await settingsService.getInvoiceSettings();
  var expirationHours = invoiceApprovalService.getApprovalExpirationHours(settings);

  return {
    ok: true,
    intent: Object.assign({}, intent, {
      context: Object.assign({}, intent.context || {}, {
        invoice: invoice,
        settings: settings,
        expirationHours: expirationHours
      })
    })
  };
}

export default {
  addGenerateInvoiceApprovalLinkContext: addGenerateInvoiceApprovalLinkContext
};
