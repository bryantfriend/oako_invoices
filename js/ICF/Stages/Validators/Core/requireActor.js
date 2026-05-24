// ICF/Stages/Validators/Core/requireActor.js

import resultHelpers from "../../../engine/resultHelpers.js";

/**
 * Requires the Intent to have a valid actor object.
 *
 * Expected actor shape:
 *
 * actor: {
 *   id: "user_123",
 *   role: "admin"
 * }
 *
 * @param {Object} intent - Current Intent.
 * @returns {Object} Validation result.
 */
function requireActor(intent) {
  var errors = [];

  if (!intent) {
    errors.push("Intent is required.");
    return resultHelpers.validationFailure(errors);
  }

  if (!intent.actor) {
    errors.push(resultHelpers.missingField("intent.actor"));
    return resultHelpers.validationFailure(errors);
  }

  if (typeof intent.actor !== "object") {
    errors.push(resultHelpers.invalidField("intent.actor must be an object"));
    return resultHelpers.validationFailure(errors);
  }

  if (Array.isArray(intent.actor)) {
    errors.push(resultHelpers.invalidField("intent.actor must not be an array"));
    return resultHelpers.validationFailure(errors);
  }

  if (!intent.actor.id) {
    errors.push(resultHelpers.missingField("intent.actor.id"));
  }

  if (!intent.actor.role) {
    errors.push(resultHelpers.missingField("intent.actor.role"));
  }

  if (errors.length > 0) {
    return resultHelpers.validationFailure(errors);
  }

  return resultHelpers.success(intent);
}

export default {
  requireActor: requireActor
};