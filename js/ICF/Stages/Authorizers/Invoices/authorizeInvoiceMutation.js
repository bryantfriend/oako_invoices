import resultHelpers from "../../../engine/resultHelpers.js";

function authorizeInvoiceMutation(intent) {
  if (!intent || !intent.context) {
    return resultHelpers.authorizationFailure("Intent context is required.");
  }

  if (!intent.context.currentUser) {
    return resultHelpers.authorizationFailure("Only admins can update invoices.");
  }

  if (!intent.actor || (intent.actor.role !== "admin" && intent.actor.role !== "superadmin")) {
    return resultHelpers.authorizationFailure("Only admins can update invoices.");
  }

  if (!isWithinScope(intent)) {
    return resultHelpers.authorizationFailure("You do not have access to update this invoice.");
  }

  return resultHelpers.success(intent);
}

function isWithinScope(intent) {
  var invoice = intent.context.invoice || {};
  var settings = intent.context.settings || {};
  var scopeId = settings.storeId || settings.companyId || "";
  var invoiceScopeId = invoice.storeId || invoice.companyId || "";

  if (!scopeId || !invoiceScopeId) {
    return true;
  }

  return scopeId === invoiceScopeId;
}

export default {
  authorizeInvoiceMutation: authorizeInvoiceMutation
};
