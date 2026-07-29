import resultHelpers from "../../../engine/resultHelpers.js";

var ALLOWED_ROLES = ["admin", "owner", "manager", "superadmin", "super_admin"];

function authorizeMarkInvoicePrinted(intent) {
  var role = intent && intent.actor ? String(intent.actor.role || "").toLowerCase() : "";
  var context = intent && intent.context ? intent.context : {};
  if (!context.currentUser || ALLOWED_ROLES.indexOf(role) === -1) {
    return resultHelpers.authorizationFailure("Only signed-in admins can mark invoices as printed.");
  }
  if (!context.invoice) {
    return resultHelpers.authorizationFailure("Invoice not found.");
  }
  if (!context.order) {
    return resultHelpers.authorizationFailure("The invoice order was not found.");
  }
  if (String(context.invoice.orderId || "") !== String(intent.payload.orderId || "")) {
    return resultHelpers.authorizationFailure("Invoice and order do not match.");
  }
  if (String(context.order.id || "") !== String(intent.payload.orderId || "")) {
    return resultHelpers.authorizationFailure("Trusted order context does not match the requested order.");
  }
  return resultHelpers.success(intent);
}

export default {
  authorizeMarkInvoicePrinted: authorizeMarkInvoicePrinted
};
