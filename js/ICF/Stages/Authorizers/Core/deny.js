// ICF/Stages/Authorizers/Core/deny.js

import resultHelpers from "../../../engine/resultHelpers.js";

/**
 * Explicit deny authorizer.
 *
 * Useful for disabled, unfinished, or dangerous Intents.
 *
 * @param {Object} intent - Current Intent.
 * @returns {Object} Authorization result.
 */
function deny(intent) {
  return resultHelpers.authorizationFailure("This Intent is currently not allowed.");
}

export default {
  deny: deny
};