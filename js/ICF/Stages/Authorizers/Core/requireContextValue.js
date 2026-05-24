// ICF/Stages/Authorizers/Core/requireContextValue.js

import resultHelpers from "../../../engine/resultHelpers.js";

/**
 * Creates an authorizer that requires a context value to equal an expected value.
 *
 * Example:
 *
 * var requireActiveSubscription = createRequireContextValueAuthorizer(
 *   "subscriptionStatus",
 *   "active"
 * );
 *
 * @param {string} contextKey - Context key to check.
 * @param {*} expectedValue - Expected value.
 * @returns {Function} Authorizer function.
 */
function createRequireContextValueAuthorizer(contextKey, expectedValue) {
  function requireContextValue(intent) {
    var errors = [];

    if (!contextKey) {
      errors.push("Context key is required.");
      return resultHelpers.authorizationFailure(errors);
    }

    if (!intent) {
      errors.push("Intent is required.");
      return resultHelpers.authorizationFailure(errors);
    }

    if (!intent.context) {
      errors.push("Intent context is required.");
      return resultHelpers.authorizationFailure(errors);
    }

    if (!contextHasKey(intent.context, contextKey)) {
      errors.push("Required context value is missing: " + contextKey + ".");
      return resultHelpers.authorizationFailure(errors);
    }

    if (intent.context[contextKey] !== expectedValue) {
      errors.push("Required context value does not match: " + contextKey + ".");
      return resultHelpers.authorizationFailure(errors);
    }

    return resultHelpers.success(intent);
  }

  return requireContextValue;
}

/**
 * Checks whether context owns a key.
 *
 * @param {Object} context - Intent context.
 * @param {string} contextKey - Context key.
 * @returns {boolean} True if key exists.
 */
function contextHasKey(context, contextKey) {
  if (!context) {
    return false;
  }

  if (Object.prototype.hasOwnProperty.call(context, contextKey)) {
    return true;
  }

  return false;
}

export default {
  createRequireContextValueAuthorizer: createRequireContextValueAuthorizer
};