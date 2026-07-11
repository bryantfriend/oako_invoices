// ICF/Intents/intents.js

import intentRegistry from "../engine/intentRegistry.js";

import archiveInvoiceIntentModule from "./ArchiveInvoiceIntent.js";
import demoIntentModule from "./DemoIntent.js";
import generateInvoiceApprovalLinkIntentModule from "./GenerateInvoiceApprovalLinkIntent.js";
import submitInvoiceApprovalResponseIntentModule from "./SubmitInvoiceApprovalResponseIntent.js";
import updateInvoiceItemsIntentModule from "./UpdateInvoiceItemsIntent.js";
import recordInvoiceReturnIntentModule from "./RecordInvoiceReturnIntent.js";
import updateOrderStatusIntentModule from "./UpdateOrderStatusIntent.js";
import invalidateInvoicesCacheIntentModule from "./InvalidateInvoicesCacheIntent.js";
import refreshInvoicesIntentModule from "./RefreshInvoicesIntent.js";
import loadInvoicesIntentModule from "./LoadInvoicesIntent.js";
import invalidateOrdersCacheIntentModule from "./InvalidateOrdersCacheIntent.js";
import refreshOrdersIntentModule from "./RefreshOrdersIntent.js";
import loadOrdersIntentModule from "./LoadOrdersIntent.js";

/**
 * Registers all project Intents.
 *
 * Add new Intent registrations here as the project grows.
 *
 * @returns {Object} Registration result.
 */
function registerProjectIntents() {
  return intentRegistry.registerIntents({
    ArchiveInvoiceIntent: archiveInvoiceIntentModule.createArchiveInvoiceIntent,
    GenerateInvoiceApprovalLinkIntent:
      generateInvoiceApprovalLinkIntentModule.createGenerateInvoiceApprovalLinkIntent,
    SubmitInvoiceApprovalResponseIntent:
      submitInvoiceApprovalResponseIntentModule.createSubmitInvoiceApprovalResponseIntent,
    UpdateInvoiceItemsIntent:
      updateInvoiceItemsIntentModule.createUpdateInvoiceItemsIntent,
    RecordInvoiceReturnIntent:
      recordInvoiceReturnIntentModule.createRecordInvoiceReturnIntent,
    UpdateOrderStatusIntent:
      updateOrderStatusIntentModule.createUpdateOrderStatusIntent,
    LoadOrdersIntent: loadOrdersIntentModule.createLoadOrdersIntent,
    RefreshOrdersIntent: refreshOrdersIntentModule.createRefreshOrdersIntent,
    InvalidateOrdersCacheIntent:
      invalidateOrdersCacheIntentModule.createInvalidateOrdersCacheIntent,
    LoadInvoicesIntent: loadInvoicesIntentModule.createLoadInvoicesIntent,
    RefreshInvoicesIntent: refreshInvoicesIntentModule.createRefreshInvoicesIntent,
    InvalidateInvoicesCacheIntent:
      invalidateInvoicesCacheIntentModule.createInvalidateInvoicesCacheIntent,
    DemoIntent: demoIntentModule.createDemoIntent
  });
}

export default {
  registerProjectIntents: registerProjectIntents
};
