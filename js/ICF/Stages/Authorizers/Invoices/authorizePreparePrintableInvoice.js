import resultHelpers from "../../../engine/resultHelpers.js";

function authorizePreparePrintableInvoice(intent) {
  var role = intent && intent.actor ? intent.actor.role : "";
  var allowedRoles = ["admin", "owner", "manager", "superadmin", "super_admin"];
  if (!intent || !intent.context || !intent.context.currentUser) {
    return resultHelpers.authorizationFailure("Sign in to prepare an invoice.");
  }
  if (allowedRoles.indexOf(role) === -1) {
    return resultHelpers.authorizationFailure("You do not have permission to prepare invoices.");
  }
  if (typeof intent.context.invoiceApi !== "function") {
    return resultHelpers.authorizationFailure("Invoice preparation is unavailable.");
  }
  return resultHelpers.success(intent);
}

export default {
  authorizePreparePrintableInvoice: authorizePreparePrintableInvoice
};
