// ICF/Stages/Emitters/emitters.js

import passEmitModule from "./Core/passEmit.js";
import addSuccessMessageModule from "./Core/addSuccessMessage.js";
import addEventModule from "./Core/addEvent.js";
import addResultMessageModule from "./Core/addResultMessage.js";
import addDebugSummaryModule from "./Core/addDebugSummary.js";
import emitArchiveInvoiceResultModule from "./Invoices/emitArchiveInvoiceResult.js";
import emitGenerateInvoiceApprovalLinkResultModule from "./Invoices/emitGenerateInvoiceApprovalLinkResult.js";
import emitSubmitInvoiceApprovalResponseResultModule from "./Invoices/emitSubmitInvoiceApprovalResponseResult.js";
import emitUpdateInvoiceItemsResultModule from "./Invoices/emitUpdateInvoiceItemsResult.js";
import emitRecordInvoiceReturnResultModule from "./Invoices/emitRecordInvoiceReturnResult.js";
import emitUpdateOrderStatusResultModule from "./Orders/emitUpdateOrderStatusResult.js";
import emitQuickPrintSelectedInvoicesResultModule from "./Invoices/emitQuickPrintSelectedInvoicesResult.js";

/**
 * Emitters
 *
 * This file gathers all emitter functions and emitter factories into one
 * readable object.
 *
 * Intent files should import this file, then choose the emitters they need.
 *
 * Emit should prepare useful result data, events, logs, notifications,
 * analytics instructions, or UI feedback instructions.
 */

var emitters = {
  passEmit: passEmitModule.passEmit,
  emitArchiveInvoiceResult:
    emitArchiveInvoiceResultModule.emitArchiveInvoiceResult,
  emitGenerateInvoiceApprovalLinkResult:
    emitGenerateInvoiceApprovalLinkResultModule.emitGenerateInvoiceApprovalLinkResult,
  emitSubmitInvoiceApprovalResponseResult:
    emitSubmitInvoiceApprovalResponseResultModule.emitSubmitInvoiceApprovalResponseResult,
  emitUpdateInvoiceItemsResult:
    emitUpdateInvoiceItemsResultModule.emitUpdateInvoiceItemsResult,
  emitRecordInvoiceReturnResult:
    emitRecordInvoiceReturnResultModule.emitRecordInvoiceReturnResult,
  emitUpdateOrderStatusResult:
    emitUpdateOrderStatusResultModule.emitUpdateOrderStatusResult,

  emitQuickPrintSelectedInvoicesResult:
    emitQuickPrintSelectedInvoicesResultModule.emitQuickPrintSelectedInvoicesResult,

  createAddSuccessMessageEmitter:
    addSuccessMessageModule.createAddSuccessMessageEmitter,

  createAddEventEmitter:
    addEventModule.createAddEventEmitter,

  createAddResultMessageEmitter:
    addResultMessageModule.createAddResultMessageEmitter,

  addDebugSummary:
    addDebugSummaryModule.addDebugSummary
};

export default emitters;
