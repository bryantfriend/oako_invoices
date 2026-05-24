// ICF/Stages/ContextProviders/Core/addSourceContext.js

import resultHelpers from "../../../engine/resultHelpers.js";

/**
 * Adds source context from intent.meta.source.
 *
 * Example sources:
 * - ui
 * - api
 * - game
 * - system
 *
 * This does not validate whether the source is trusted.
 * It only copies the value into context for later stages.
 *
 * @param {Object} intent - Current Intent.
 * @returns {Object} Context result.
 */
function addSourceContext(intent) {
  if (!intent) {
    return resultHelpers.contextFailure("Intent is required.");
  }

  if (!intent.meta) {
    return resultHelpers.contextFailure("Intent meta is required to add source context.");
  }

  if (!intent.meta.source) {
    return resultHelpers.contextFailure("Intent meta.source is required.");
  }

  var updatedIntent = resultHelpers.addContextValue(
    intent,
    "source",
    intent.meta.source
  );

  return resultHelpers.success(updatedIntent);
}

export default {
  addSourceContext: addSourceContext
};