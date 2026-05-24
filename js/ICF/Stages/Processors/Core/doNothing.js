// ICF/Stages/Processors/Core/doNothing.js

import resultHelpers from "../../../engine/resultHelpers.js";

/**
 * Explicit no-op processor.
 *
 * Use this when the Process stage is required but no state change
 * should happen yet.
 *
 * This is useful for:
 * - testing new Intents
 * - placeholder Intents
 * - read-only Intents
 * - early template setup
 *
 * @param {Object} intent - Current Intent.
 * @returns {Object} Process result.
 */
function doNothing(intent) {
  return resultHelpers.success(intent);
}

export default {
  doNothing: doNothing
};