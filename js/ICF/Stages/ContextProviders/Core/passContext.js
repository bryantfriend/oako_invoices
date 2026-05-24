// ICF/Stages/ContextProviders/Core/passContext.js

import resultHelpers from "../../../engine/resultHelpers.js";

/**
 * Explicit pass-through context provider.
 *
 * Use this when the AddContext stage is required but no trusted context
 * needs to be added yet.
 *
 * @param {Object} intent - Current Intent.
 * @returns {Object} Success result.
 */
function passContext(intent) {
  return resultHelpers.success(intent);
}

export default {
  passContext: passContext
};