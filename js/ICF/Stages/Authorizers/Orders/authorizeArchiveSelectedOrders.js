import resultHelpers from "../../../engine/resultHelpers.js";

var ALLOWED_ROLES = ["admin", "owner", "manager", "superadmin", "super_admin"];

function authorizeArchiveSelectedOrders(intent) {
  var role = intent && intent.actor ? String(intent.actor.role || "").toLowerCase() : "";
  var currentUser = intent && intent.context ? intent.context.currentUser : null;
  if (!currentUser || ALLOWED_ROLES.indexOf(role) === -1) {
    return resultHelpers.authorizationFailure("Only signed-in administrators can archive orders.");
  }
  return resultHelpers.success(intent);
}

export default {
  authorizeArchiveSelectedOrders: authorizeArchiveSelectedOrders
};
