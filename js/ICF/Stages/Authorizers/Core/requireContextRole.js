// ICF/Stages/Authorizers/Core/requireContextRole.js

import resultHelpers from "../../../engine/resultHelpers.js";

/**
 * Creates an authorizer that requires intent.context.actorRole
 * to match one of the allowed roles.
 *
 * This is usually safer than checking intent.actor.role when the context role
 * was added from a trusted source during AddContext.
 *
 * Example:
 *
 * var requireTrustedAdmin = createRequireContextRoleAuthorizer([
 *   "admin",
 *   "superadmin"
 * ]);
 *
 * @param {Array} allowedRoles - Allowed roles.
 * @returns {Function} Authorizer function.
 */
function createRequireContextRoleAuthorizer(allowedRoles) {
  function requireContextRole(intent) {
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

    if (!intent.context) {
      errors.push("Intent context is required.");
      return resultHelpers.authorizationFailure(errors);
    }

    if (!intent.context.actorRole) {
      errors.push("Trusted context actorRole is required.");
      return resultHelpers.authorizationFailure(errors);
    }

    if (!roleIsAllowed(intent.context.actorRole, allowedRoles)) {
      errors.push("Context role is not authorized: " + intent.context.actorRole + ".");
      return resultHelpers.authorizationFailure(errors);
    }

    return resultHelpers.success(intent);
  }

  return requireContextRole;
}

/**
 * Checks whether the context role is allowed.
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
  createRequireContextRoleAuthorizer: createRequireContextRoleAuthorizer
};