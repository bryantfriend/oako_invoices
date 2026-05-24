// ICF/Stages/Processors/Core/setResultData.js

import resultHelpers from "../../../engine/resultHelpers.js";

/**
 * Creates a processor that stores fixed result data in intent.context.resultData.
 *
 * Example:
 *
 * var setDemoResult = createSetResultDataProcessor({
 *   message: "Demo completed."
 * });
 *
 * @param {Object} resultData - Result data to store.
 * @returns {Function} Processor function.
 */
function createSetResultDataProcessor(resultData) {
  function setResultData(intent) {
    if (!intent) {
      return resultHelpers.processFailure("Intent is required.");
    }

    if (!resultData) {
      return resultHelpers.processFailure("Result data is required.");
    }

    if (typeof resultData !== "object") {
      return resultHelpers.processFailure("Result data must be an object.");
    }

    if (Array.isArray(resultData)) {
      return resultHelpers.processFailure("Result data must not be an array.");
    }

    var updatedIntent = resultHelpers.addResultDataToIntent(intent, resultData);

    return resultHelpers.success(updatedIntent);
  }

  return setResultData;
}

export default {
  createSetResultDataProcessor: createSetResultDataProcessor
};