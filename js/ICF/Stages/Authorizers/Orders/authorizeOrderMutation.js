// ICF/Stages/Authorizers/Orders/authorizeOrderMutation.js

import resultHelpers from "../../../engine/resultHelpers.js";

var ALLOWED_ROLES = [
  "admin",
  "owner",
  "manager",
  "superadmin",
  "super_admin"
];

/**
 * Authorizes order mutation intents.
 *
 * @param {Object} intent - Current Intent.
 * @returns {Object} Authorization result.
 */
function authorizeOrderMutation(intent) {
  var role = intent && intent.actor ? String(intent.actor.role || "").toLowerCase() : "";

  if (ALLOWED_ROLES.indexOf(role) === -1) {
    return resultHelpers.authorizationFailure("Actor is not allowed to update orders.");
  }

  return resultHelpers.success(intent);
}

export default {
  authorizeOrderMutation: authorizeOrderMutation
};
