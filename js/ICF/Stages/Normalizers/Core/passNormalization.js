// ICF/Stages/Normalizers/Core/passNormalization.js

import resultHelpers from "../../../engine/resultHelpers.js";

/**
 * Explicit pass-through normalizer.
 *
 * Use this when the Normalize stage is required but no normalization is needed yet.
 *
 * @param {Object} intent - Current Intent.
 * @returns {Object} Success result.
 */
function passNormalization(intent) {
  return resultHelpers.success(intent);
}

export default {
  passNormalization: passNormalization
};