// ICF/Stages/Emitters/emitters.js

import passEmitModule from "./Core/passEmit.js";
import addSuccessMessageModule from "./Core/addSuccessMessage.js";
import addEventModule from "./Core/addEvent.js";
import addResultMessageModule from "./Core/addResultMessage.js";
import addDebugSummaryModule from "./Core/addDebugSummary.js";
import emitArchiveInvoiceResultModule from "./Invoices/emitArchiveInvoiceResult.js";

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
