import validators from "../Stages/Validators/validators.js";
import normalizers from "../Stages/Normalizers/normalizers.js";
import contextProviders from "../Stages/ContextProviders/contextProviders.js";
import authorizers from "../Stages/Authorizers/authorizers.js";
import processors from "../Stages/Processors/processors.js";
import emitters from "../Stages/Emitters/emitters.js";

function createQuickPrintSelectedInvoicesIntent(actor, payload, options) {
  return {
    type: "QUICK_PRINT_SELECTED_INVOICES",
    actor: actor || { id: "anonymous", role: "anonymous" },
    payload: Object.assign({}, payload || {}),
    context: {},
    privateOptions: options && options.printOptions ? options.printOptions : {},
    meta: {
      createdAt: Date.now(),
      source: options && options.source ? options.source : "ui"
    },
    stages: {
      Validate: {
        requireBaseIntentShape: validators.requireBaseIntentShape,
        validateQuickPrintSelectedInvoicesPayload: validators.validateQuickPrintSelectedInvoicesPayload
      },
      Normalize: {
        normalizeQuickPrintSelectedInvoicesPayload: normalizers.normalizeQuickPrintSelectedInvoicesPayload
      },
      AddContext: {
        addQuickPrintSelectedInvoicesContext: contextProviders.addQuickPrintSelectedInvoicesContext
      },
      Authorize: {
        authorizeQuickPrintSelectedInvoices: authorizers.authorizeQuickPrintSelectedInvoices
      },
      Process: {
        processQuickPrintSelectedInvoices: processors.processQuickPrintSelectedInvoices
      },
      Emit: {
        emitQuickPrintSelectedInvoicesResult: emitters.emitQuickPrintSelectedInvoicesResult
      }
    }
  };
}

export default {
  createQuickPrintSelectedInvoicesIntent: createQuickPrintSelectedInvoicesIntent
};
