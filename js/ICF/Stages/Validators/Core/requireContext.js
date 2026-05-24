// ICF/Stages/Validators/Core/requireContext.js

import resultHelpers from "../../../engine/resultHelpers.js";

/**
 * Requires the Intent to have a context object.
 *
 * Context is where AddContext steps place trusted system data.
 *
 * @param {Object} intent - Current Intent.
 * @returns {Object} Validation result.
 */
function requireContext(intent) {
  var errors = [];

  if (!intent) {
    errors.push("Intent is required.");
    return resultHelpers.validationFailure(errors);
  }

  if (!intent.context) {
    errors.push(resultHelpers.missingField("intent.context"));
    return resultHelpers.validationFailure(errors);
  }

  if (typeof intent.context !== "object") {
    errors.push(resultHelpers.invalidField("intent.context must be an object"));
    return resultHelpers.validationFailure(errors);
  }

  if (Array.isArray(intent.context)) {
    errors.push(resultHelpers.invalidField("intent.context must not be an array"));
    return resultHelpers.validationFailure(errors);
  }

  return resultHelpers.success(intent);
}

export default {
  requireContext: requireContext
};