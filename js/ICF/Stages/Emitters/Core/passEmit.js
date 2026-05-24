// ICF/Stages/Emitters/Core/passEmit.js

import resultHelpers from "../../../engine/resultHelpers.js";

/**
 * Explicit pass-through emitter.
 *
 * Use this when the Emit stage is required but no event, message,
 * or final output needs to be added yet.
 *
 * @param {Object} intent - Current Intent.
 * @returns {Object} Emit result.
 */
function passEmit(intent) {
  return resultHelpers.success(intent);
}

export default {
  passEmit: passEmit
};