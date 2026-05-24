// ICF/Stages/ContextProviders/Core/addTimestampContext.js

import resultHelpers from "../../../engine/resultHelpers.js";

/**
 * Adds a trusted timestamp to intent.context.
 *
 * This is useful when processors need a consistent execution timestamp.
 *
 * @param {Object} intent - Current Intent.
 * @returns {Object} Context result.
 */
function addTimestampContext(intent) {
  if (!intent) {
    return resultHelpers.contextFailure("Intent is required.");
  }

  var timestampContext = {
    timestamp: Date.now(),
    isoTimestamp: new Date().toISOString()
  };

  var updatedIntent = resultHelpers.addContextValues(intent, timestampContext);

  return resultHelpers.success(updatedIntent);
}

export default {
  addTimestampContext: addTimestampContext
};