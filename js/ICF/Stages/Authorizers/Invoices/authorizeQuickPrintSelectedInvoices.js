import resultHelpers from "../../../engine/resultHelpers.js";

function authorizeQuickPrintSelectedInvoices(intent) {
  if (!intent || !intent.context || !intent.context.currentUser) {
    return resultHelpers.authorizationFailure("Sign in as an administrator to print invoices.");
  }
  if (!intent.actor || (intent.actor.role !== "admin" && intent.actor.role !== "superadmin")) {
    return resultHelpers.authorizationFailure("Only administrators can print invoices.");
  }
  return resultHelpers.success(intent);
}

export default {
  authorizeQuickPrintSelectedInvoices: authorizeQuickPrintSelectedInvoices
};
