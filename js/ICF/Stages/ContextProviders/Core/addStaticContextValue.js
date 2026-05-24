// ICF/Stages/ContextProviders/Core/addStaticContextValue.js

import resultHelpers from "../../../engine/resultHelpers.js";

/**
 * Creates a context provider that adds one static context value.
 *
 * Example:
 *
 * var addAppName = createAddStaticContextValueProvider(
 *   "appName",
 *   "Daily Bread"
 * );
 *
 * @param {string} contextKey - Context key.
 * @param {*} contextValue - Context value.
 * @returns {Function} Context provider function.
 */
function createAddStaticContextValueProvider(contextKey, contextValue) {
  function addStaticContextValue(intent) {
    if (!contextKey) {
      return resultHelpers.contextFailure("Context key is required.");
    }

    if (!intent) {
      return resultHelpers.contextFailure("Intent is required.");
    }

    var updatedIntent = resultHelpers.addContextValue(
      intent,
      contextKey,
      contextValue
    );

    return resultHelpers.success(updatedIntent);
  }

  return addStaticContextValue;
}

export default {
  createAddStaticContextValueProvider: createAddStaticContextValueProvider
};