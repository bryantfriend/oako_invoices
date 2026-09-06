// ICF/Stages/Authorizers/authorizers.js

import allowModule from "./Core/allow.js";
import denyModule from "./Core/deny.js";
import passAuthorizeModule from "./Core/passAuthorize.js";
import requireActorRoleModule from "./Core/requireActorRole.js";
import requireContextRoleModule from "./Core/requireContextRole.js";
import requireContextValueModule from "./Core/requireContextValue.js";
import authorizeArchiveInvoiceModule from "./Invoices/authorizeArchiveInvoice.js";
import authorizeGenerateInvoiceApprovalLinkModule from "./Invoices/authorizeGenerateInvoiceApprovalLink.js";
import authorizeSubmitInvoiceApprovalResponseModule from "./Invoices/authorizeSubmitInvoiceApprovalResponse.js";
import authorizeInvoiceMutationModule from "./Invoices/authorizeInvoiceMutation.js";
import authorizeOrderMutationModule from "./Orders/authorizeOrderMutation.js";
import authorizeQuickPrintSelectedInvoicesModule from "./Invoices/authorizeQuickPrintSelectedInvoices.js";
import authorizeMarkInvoicePrintedModule from "./Invoices/authorizeMarkInvoicePrinted.js";
import authorizeDashboardAnalyticsRangeModule from "./Dashboard/authorizeDashboardAnalyticsRange.js";
import authorizeArchiveSelectedOrdersModule from "./Orders/authorizeArchiveSelectedOrders.js";
import authorizePreparePrintableInvoiceModule from "./Invoices/authorizePreparePrintableInvoice.js";

/**
 * Authorizers
 *
 * This file gathers all authorizer functions and authorizer factories
 * into one readable object.
 *
 * Intent files should import this file, then choose the authorizers they need.
 *
 * Authorize should decide whether the actor is allowed to perform the Intent.
 */

import authorizeConfirmProductMatchModule from "./Products/authorizeConfirmProductMatch.js";

var authorizers = {
  authorizeConfirmProductMatch: authorizeConfirmProductMatchModule.authorizeConfirmProductMatch,
  allow: allowModule.allow,
  deny: denyModule.deny,
  passAuthorize: passAuthorizeModule.passAuthorize,
  authorizeArchiveInvoice: authorizeArchiveInvoiceModule.authorizeArchiveInvoice,
  authorizeGenerateInvoiceApprovalLink:
    authorizeGenerateInvoiceApprovalLinkModule.authorizeGenerateInvoiceApprovalLink,
  authorizeSubmitInvoiceApprovalResponse:
    authorizeSubmitInvoiceApprovalResponseModule.authorizeSubmitInvoiceApprovalResponse,
  authorizeInvoiceMutation:
    authorizeInvoiceMutationModule.authorizeInvoiceMutation,
  authorizeOrderMutation:
    authorizeOrderMutationModule.authorizeOrderMutation,

  authorizeQuickPrintSelectedInvoices:
    authorizeQuickPrintSelectedInvoicesModule.authorizeQuickPrintSelectedInvoices,
  authorizeMarkInvoicePrinted:
    authorizeMarkInvoicePrintedModule.authorizeMarkInvoicePrinted,
  authorizeDashboardAnalyticsRange:
    authorizeDashboardAnalyticsRangeModule.authorizeDashboardAnalyticsRange,
  authorizeArchiveSelectedOrders:
    authorizeArchiveSelectedOrdersModule.authorizeArchiveSelectedOrders,
  authorizePreparePrintableInvoice:
    authorizePreparePrintableInvoiceModule.authorizePreparePrintableInvoice,

  createRequireActorRoleAuthorizer:
    requireActorRoleModule.createRequireActorRoleAuthorizer,

  createRequireContextRoleAuthorizer:
    requireContextRoleModule.createRequireContextRoleAuthorizer,

  createRequireContextValueAuthorizer:
    requireContextValueModule.createRequireContextValueAuthorizer
};

export default authorizers;
