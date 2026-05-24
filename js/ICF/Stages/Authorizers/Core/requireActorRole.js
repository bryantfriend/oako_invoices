// ICF/Stages/Authorizers/Core/requireActorRole.js

import resultHelpers from "../../../engine/resultHelpers.js";

/**
 * Creates an authorizer that requires the actor to have one of the allowed roles.
 *
 * Example:
 *
 * var requireAdmin = createRequireActorRoleAuthorizer([
 *   "admin",
 *   "superadmin"
 * ]);
 *
 * @param {Array} allowedRoles - Allowed roles.
 * @returns {Function} Authorizer function.
 */
function createRequireActorRoleAuthorizer(allowedRoles) {
  function requireActorRole(intent) {
    var errors = [];

    if (!allowedRoles) {
      errors.push("Allowed roles are required.");
      return resultHelpers.authorizationFailure(errors);
    }

    if (!Array.isArray(allowedRoles)) {
      errors.push("Allowed roles must be an array.");
      return resultHelpers.authorizationFailure(errors);
    }

    if (!intent) {
      errors.push("Intent is required.");
      return resultHelpers.authorizationFailure(errors);
    }

    if (!intent.actor) {
      errors.push("Intent actor is required.");
      return resultHelpers.authorizationFailure(errors);
    }

    if (!intent.actor.role) {
      errors.push("Intent actor.role is required.");
      return resultHelpers.authorizationFailure(errors);
    }

    if (!roleIsAllowed(intent.actor.role, allowedRoles)) {
      errors.push("Actor role is not authorized: " + intent.actor.role + ".");
      return resultHelpers.authorizationFailure(errors);
    }

    return resultHelpers.success(intent);
  }

  return requireActorRole;
}

/**
 * Checks whether the actor role is allowed.
 *
 * @param {string} actorRole - Actor role.
 * @param {Array} allowedRoles - Allowed roles.
 * @returns {boolean} True if allowed.
 */
function roleIsAllowed(actorRole, allowedRoles) {
  var roleIndex = 0;

  while (roleIndex < allowedRoles.length) {
    if (allowedRoles[roleIndex] === actorRole) {
      return true;
    }

    roleIndex = roleIndex + 1;
  }

  return false;
}

export default {
  createRequireActorRoleAuthorizer: createRequireActorRoleAuthorizer
};