// ICF/Stages/Validators/Core/requireIntentType.js

import resultHelpers from "../../../engine/resultHelpers.js";

/**
 * Requires the Intent to have a valid type.
 *
 * @param {Object} intent - Current Intent.
 * @returns {Object} Validation result.
 */
function requireIntentType(intent) {
  var errors = [];

  if (!intent) {
    errors.push("Intent is required.");
    return resultHelpers.validationFailure(errors);
  }

  if (!intent.type) {
    errors.push(resultHelpers.missingField("intent.type"));
  }

  if (intent.type && typeof intent.type !== "string") {
    errors.push(resultHelpers.invalidField("intent.type must be a string"));
  }

  if (errors.length > 0) {
    return resultHelpers.validationFailure(errors);
  }

  return resultHelpers.success(intent);
}

export default {
  requireIntentType: requireIntentType
};