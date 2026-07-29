import resultHelpers from "../../../engine/resultHelpers.js";

var ALLOWED_ROLES = ["admin", "owner", "manager", "superadmin", "super_admin"];

function authorizeDashboardAnalyticsRange(intent) {
  var role = intent && intent.actor ? String(intent.actor.role || "").toLowerCase() : "";
  if (ALLOWED_ROLES.indexOf(role) === -1) {
    return resultHelpers.authorizationFailure("Actor is not allowed to view dashboard analytics.");
  }
  return resultHelpers.success(intent);
}

export default {
  authorizeDashboardAnalyticsRange: authorizeDashboardAnalyticsRange
};
