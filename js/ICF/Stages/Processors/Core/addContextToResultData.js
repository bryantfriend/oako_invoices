// ICF/Stages/Processors/Core/addContextToResultData.js

import resultHelpers from "../../../engine/resultHelpers.js";

/**
 * Adds intent.context into intent.context.resultData.
 *
 * This is mainly useful for:
 * - testing
 * - debugging
 * - confirming AddContext behavior
 *
 * @param {Object} intent - Current Intent.
 * @returns {Object} Process result.
 */
function addContextToResultData(intent) {
  if (!intent) {
    return resultHelpers.processFailure("Intent is required.");
  }

  if (!intent.context) {
    return resultHelpers.processFailure("Intent context is required.");
  }

  var resultData = {
    context: intent.context
  };

  var updatedIntent = resultHelpers.addResultDataToIntent(intent, resultData);

  return resultHelpers.success(updatedIntent);
}

export default {
  addContextToResultData: addContextToResultData
};