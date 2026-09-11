import addInvoiceWorkflowContextModule from './Workflow/addInvoiceWorkflowContext.js';
// ICF/Stages/ContextProviders/contextProviders.js

import passContextModule from "./Core/passContext.js";
import passAddContextModule from "./Core/passAddContext.js";
import addTimestampContextModule from "./Core/addTimestampContext.js";
import addSourceContextModule from "./Core/addSourceContext.js";
import addActorRoleContextModule from "./Core/addActorRoleContext.js";
import addStaticContextValueModule from "./Core/addStaticContextValue.js";
import addArchiveInvoiceContextModule from "./Invoices/addArchiveInvoiceContext.js";
import addGenerateInvoiceApprovalLinkContextModule from "./Invoices/addGenerateInvoiceApprovalLinkContext.js";
import addSubmitInvoiceApprovalResponseContextModule from "./Invoices/addSubmitInvoiceApprovalResponseContext.js";
import addInvoiceMutationContextModule from "./Invoices/addInvoiceMutationContext.js";
import addQuickPrintSelectedInvoicesContextModule from "./Invoices/addQuickPrintSelectedInvoicesContext.js";
import addMarkInvoicePrintedContextModule from "./Invoices/addMarkInvoicePrintedContext.js";
import addArchiveSelectedOrdersContextModule from "./Orders/addArchiveSelectedOrdersContext.js";
import addPreparePrintableInvoiceContextModule from "./Invoices/addPreparePrintableInvoiceContext.js";

/**
 * Context Providers
 *
 * This file gathers all context provider functions and factories into one
 * readable object.
 *
 * Intent files should import this file, then choose the context providers
 * they need.
 *
 * AddContext should attach trusted system data needed by later stages.
 */

import addConfirmProductMatchContextModule from "./Products/addConfirmProductMatchContext.js";

var contextProviders = {
  addInvoiceWorkflowContext: addInvoiceWorkflowContextModule.addInvoiceWorkflowContext,
  addConfirmProductMatchContext: addConfirmProductMatchContextModule.addConfirmProductMatchContext,
  passContext: passContextModule.passContext,
  passAddContext: passAddContextModule.passAddContext,

  addTimestampContext: addTimestampContextModule.addTimestampContext,
  addSourceContext: addSourceContextModule.addSourceContext,
  addActorRoleContext: addActorRoleContextModule.addActorRoleContext,
  addArchiveInvoiceContext:
    addArchiveInvoiceContextModule.addArchiveInvoiceContext,
  addGenerateInvoiceApprovalLinkContext:
    addGenerateInvoiceApprovalLinkContextModule.addGenerateInvoiceApprovalLinkContext,
  addSubmitInvoiceApprovalResponseContext:
    addSubmitInvoiceApprovalResponseContextModule.addSubmitInvoiceApprovalResponseContext,
  addInvoiceMutationContext:
    addInvoiceMutationContextModule.addInvoiceMutationContext,

  addQuickPrintSelectedInvoicesContext:
    addQuickPrintSelectedInvoicesContextModule.addQuickPrintSelectedInvoicesContext,
  addMarkInvoicePrintedContext:
    addMarkInvoicePrintedContextModule.addMarkInvoicePrintedContext,
  addArchiveSelectedOrdersContext:
    addArchiveSelectedOrdersContextModule.addArchiveSelectedOrdersContext,
  addPreparePrintableInvoiceContext:
    addPreparePrintableInvoiceContextModule.addPreparePrintableInvoiceContext,

  createAddStaticContextValueProvider:
    addStaticContextValueModule.createAddStaticContextValueProvider
};

export default contextProviders;
