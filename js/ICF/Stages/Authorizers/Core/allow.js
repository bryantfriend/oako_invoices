// ICF/Stages/Authorizers/Core/allow.js

import resultHelpers from "../../../engine/resultHelpers.js";

/**
 * Explicit allow authorizer.
 *
 * Use this when the Authorize stage is required but no restriction
 * is needed yet.
 *
 * @param {Object} intent - Current Intent.
 * @returns {Object} Authorization result.
 */
function allow(intent) {
  return resultHelpers.success(intent);
}

export default {
  allow: allow
};