// ICF/Stages/Validators/Core/requireActorRole.js

import resultHelpers from "../../../engine/resultHelpers.js";

/**
 * Creates a validator that requires the actor to have one of the allowed roles.
 *
 * Example:
 *
 * var requireAdminRole = createRequireActorRoleValidator([
 *   "admin",
 *   "superadmin"
 * ]);
 *
 * @param {Array} allowedRoles - Allowed actor roles.
 * @returns {Function} Validator function.
 */
function createRequireActorRoleValidator(allowedRoles) {
  function requireActorRole(intent) {
    var errors = [];

    if (!allowedRoles) {
      errors.push("Allowed roles are required.");
      return resultHelpers.validationFailure(errors);
    }

    if (!Array.isArray(allowedRoles)) {
      errors.push("Allowed roles must be an array.");
      return resultHelpers.validationFailure(errors);
    }

    if (!intent) {
      errors.push("Intent is required.");
      return resultHelpers.validationFailure(errors);
    }

    if (!intent.actor) {
      errors.push(resultHelpers.missingField("intent.actor"));
      return resultHelpers.validationFailure(errors);
    }

    if (!intent.actor.role) {
      errors.push(resultHelpers.missingField("intent.actor.role"));
      return resultHelpers.validationFailure(errors);
    }

    if (!roleIsAllowed(intent.actor.role, allowedRoles)) {
      errors.push("Actor role is not allowed for this Intent: " + intent.actor.role + ".");
    }

    if (errors.length > 0) {
      return resultHelpers.validationFailure(errors);
    }

    return resultHelpers.success(intent);
  }

  return requireActorRole;
}

/**
 * Checks whether a role is included in the allowed roles list.
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
  createRequireActorRoleValidator: createRequireActorRoleValidator
};