// ICF/Stages/Validators/Core/requirePayload.js

import resultHelpers from "../../../engine/resultHelpers.js";

/**
 * Requires the Intent to have a payload object.
 *
 * Payload is not trusted yet.
 * This only confirms that payload exists and has the correct basic shape.
 *
 * @param {Object} intent - Current Intent.
 * @returns {Object} Validation result.
 */
function requirePayload(intent) {
  var errors = [];

  if (!intent) {
    errors.push("Intent is required.");
    return resultHelpers.validationFailure(errors);
  }

  if (!intent.payload) {
    errors.push(resultHelpers.missingField("intent.payload"));
    return resultHelpers.validationFailure(errors);
  }

  if (typeof intent.payload !== "object") {
    errors.push(resultHelpers.invalidField("intent.payload must be an object"));
    return resultHelpers.validationFailure(errors);
  }

  if (Array.isArray(intent.payload)) {
    errors.push(resultHelpers.invalidField("intent.payload must not be an array"));
    return resultHelpers.validationFailure(errors);
  }

  return resultHelpers.success(intent);
}

export default {
  requirePayload: requirePayload
};