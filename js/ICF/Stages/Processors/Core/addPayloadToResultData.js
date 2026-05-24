// ICF/Stages/Processors/Core/addPayloadToResultData.js

import resultHelpers from "../../../engine/resultHelpers.js";

/**
 * Adds intent.payload into intent.context.resultData.
 *
 * This is mainly useful for:
 * - testing
 * - debugging
 * - read-only demo Intents
 *
 * @param {Object} intent - Current Intent.
 * @returns {Object} Process result.
 */
function addPayloadToResultData(intent) {
  if (!intent) {
    return resultHelpers.processFailure("Intent is required.");
  }

  if (!intent.payload) {
    return resultHelpers.processFailure("Intent payload is required.");
  }

  var resultData = {
    payload: intent.payload
  };

  var updatedIntent = resultHelpers.addResultDataToIntent(intent, resultData);

  return resultHelpers.success(updatedIntent);
}

export default {
  addPayloadToResultData: addPayloadToResultData
};