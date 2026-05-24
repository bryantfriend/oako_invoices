// ICF/Engine/resultHelpers.js

/**
 * ICF Result Helpers
 *
 * This file centralizes predictable result shapes used across the ICF system.
 *
 * These helpers should be used by:
 * - validators
 * - normalizers
 * - context providers
 * - authorizers
 * - processors
 * - emitters
 * - pipeline-level logic
 *
 * The goal is to keep every ICF response easy to read, easy to test,
 * and predictable across projects.
 */

/**
 * Creates a successful result.
 *
 * @param {Object} intent - Current or updated Intent.
 * @returns {Object} Success result.
 */
function success(intent) {
  return {
    ok: true,
    intent: intent
  };
}

/**
 * Creates a successful result with a message.
 *
 * @param {Object} intent - Current or updated Intent.
 * @param {string} message - Success message.
 * @returns {Object} Success result.
 */
function successWithMessage(intent, message) {
  return {
    ok: true,
    intent: intent,
    message: message
  };
}

/**
 * Creates a successful result with extra data.
 *
 * This does not automatically mutate the Intent.
 * Use addResultDataToIntent when you want to store data in intent.context.
 *
 * @param {Object} intent - Current or updated Intent.
 * @param {Object} data - Data to return.
 * @returns {Object} Success result.
 */
function successWithData(intent, data) {
  return {
    ok: true,
    intent: intent,
    data: data
  };
}

/**
 * Creates a pass-through success result.
 *
 * Useful for blank ICF stages that must still be explicit.
 *
 * @param {Object} intent - Current Intent.
 * @returns {Object} Success result.
 */
function passThrough(intent) {
  return {
    ok: true,
    intent: intent
  };
}

/**
 * Creates a generic failure result.
 *
 * @param {string} stageName - ICF stage name.
 * @param {Array} errors - Error messages.
 * @returns {Object} Failure result.
 */
function failure(stageName, errors) {
  return {
    ok: false,
    stage: stageName,
    errors: normalizeErrors(errors)
  };
}

/**
 * Creates a failure result for one specific step.
 *
 * @param {string} stageName - ICF stage name.
 * @param {string} stepName - Step name inside the stage.
 * @param {Array} errors - Error messages.
 * @returns {Object} Failure result.
 */
function stepFailure(stageName, stepName, errors) {
  return {
    ok: false,
    stage: stageName,
    step: stepName,
    errors: normalizeErrors(errors)
  };
}

/**
 * Creates a validation failure.
 *
 * @param {Array} errors - Validation error messages.
 * @returns {Object} Validation failure result.
 */
function validationFailure(errors) {
  return {
    ok: false,
    stage: "Validate",
    errors: normalizeErrors(errors)
  };
}

/**
 * Creates a normalization failure.
 *
 * @param {Array} errors - Normalization error messages.
 * @returns {Object} Normalization failure result.
 */
function normalizationFailure(errors) {
  return {
    ok: false,
    stage: "Normalize",
    errors: normalizeErrors(errors)
  };
}

/**
 * Creates an AddContext failure.
 *
 * @param {Array} errors - Context error messages.
 * @returns {Object} AddContext failure result.
 */
function contextFailure(errors) {
  return {
    ok: false,
    stage: "AddContext",
    errors: normalizeErrors(errors)
  };
}

/**
 * Creates an authorization failure.
 *
 * @param {string} reason - Authorization failure reason.
 * @returns {Object} Authorization failure result.
 */
function authorizationFailure(reason) {
  return {
    ok: false,
    stage: "Authorize",
    reason: reason,
    errors: normalizeErrors(reason)
  };
}

/**
 * Creates a process failure.
 *
 * @param {Array} errors - Process error messages.
 * @returns {Object} Process failure result.
 */
function processFailure(errors) {
  return {
    ok: false,
    stage: "Process",
    errors: normalizeErrors(errors)
  };
}

/**
 * Creates an emit failure.
 *
 * @param {Array} errors - Emit error messages.
 * @returns {Object} Emit failure result.
 */
function emitFailure(errors) {
  return {
    ok: false,
    stage: "Emit",
    errors: normalizeErrors(errors)
  };
}

/**
 * Adds result data to intent.context.resultData.
 *
 * This helper creates missing objects safely.
 *
 * @param {Object} intent - Current Intent.
 * @param {Object} resultData - Data to attach.
 * @returns {Object} Updated Intent.
 */
function addResultDataToIntent(intent, resultData) {
  var updatedIntent = ensureIntentContext(intent);

  updatedIntent.context.resultData = resultData;

  return updatedIntent;
}

/**
 * Adds one event to intent.context.events.
 *
 * @param {Object} intent - Current Intent.
 * @param {Object} event - Event to attach.
 * @returns {Object} Updated Intent.
 */
function addEventToIntent(intent, event) {
  var updatedIntent = ensureIntentContext(intent);

  if (!updatedIntent.context.events) {
    updatedIntent.context.events = [];
  }

  if (!Array.isArray(updatedIntent.context.events)) {
    updatedIntent.context.events = [];
  }

  updatedIntent.context.events.push(event);

  return updatedIntent;
}

/**
 * Adds many events to intent.context.events.
 *
 * @param {Object} intent - Current Intent.
 * @param {Array} events - Events to attach.
 * @returns {Object} Updated Intent.
 */
function addEventsToIntent(intent, events) {
  var updatedIntent = ensureIntentContext(intent);

  if (!events) {
    return updatedIntent;
  }

  if (!Array.isArray(events)) {
    return updatedIntent;
  }

  var eventIndex = 0;

  while (eventIndex < events.length) {
    updatedIntent = addEventToIntent(updatedIntent, events[eventIndex]);
    eventIndex = eventIndex + 1;
  }

  return updatedIntent;
}

/**
 * Adds a context value to intent.context.
 *
 * Use this during AddContext steps.
 *
 * @param {Object} intent - Current Intent.
 * @param {string} key - Context key.
 * @param {*} value - Context value.
 * @returns {Object} Updated Intent.
 */
function addContextValue(intent, key, value) {
  var updatedIntent = ensureIntentContext(intent);

  updatedIntent.context[key] = value;

  return updatedIntent;
}

/**
 * Adds many context values to intent.context.
 *
 * @param {Object} intent - Current Intent.
 * @param {Object} contextValues - Values to add.
 * @returns {Object} Updated Intent.
 */
function addContextValues(intent, contextValues) {
  var updatedIntent = ensureIntentContext(intent);

  if (!contextValues) {
    return updatedIntent;
  }

  if (typeof contextValues !== "object") {
    return updatedIntent;
  }

  if (Array.isArray(contextValues)) {
    return updatedIntent;
  }

  var contextKeys = Object.keys(contextValues);
  var keyIndex = 0;

  while (keyIndex < contextKeys.length) {
    var contextKey = contextKeys[keyIndex];
    updatedIntent.context[contextKey] = contextValues[contextKey];

    keyIndex = keyIndex + 1;
  }

  return updatedIntent;
}

/**
 * Adds or replaces the payload.
 *
 * Use this during Normalize steps when payload data has been cleaned.
 *
 * @param {Object} intent - Current Intent.
 * @param {Object} payload - Updated payload.
 * @returns {Object} Updated Intent.
 */
function replacePayload(intent, payload) {
  var updatedIntent = ensureIntent(intent);

  updatedIntent.payload = payload;

  return updatedIntent;
}

/**
 * Adds one payload value.
 *
 * Use this during Normalize steps.
 *
 * @param {Object} intent - Current Intent.
 * @param {string} key - Payload key.
 * @param {*} value - Payload value.
 * @returns {Object} Updated Intent.
 */
function addPayloadValue(intent, key, value) {
  var updatedIntent = ensureIntent(intent);

  if (!updatedIntent.payload) {
    updatedIntent.payload = {};
  }

  updatedIntent.payload[key] = value;

  return updatedIntent;
}

/**
 * Creates a standard event object.
 *
 * @param {string} type - Event type.
 * @param {Object} data - Event data.
 * @returns {Object} Event object.
 */
function createEvent(type, data) {
  return {
    type: type,
    data: data,
    createdAt: Date.now()
  };
}

/**
 * Creates a standard error message array.
 *
 * @param {*} errors - Error input.
 * @returns {Array} Error array.
 */
function normalizeErrors(errors) {
  if (!errors) {
    return [
      "Unknown error."
    ];
  }

  if (Array.isArray(errors)) {
    return errors;
  }

  if (typeof errors === "string") {
    return [
      errors
    ];
  }

  if (errors.message) {
    return [
      errors.message
    ];
  }

  return [
    "Unknown error."
  ];
}

/**
 * Ensures an Intent object exists.
 *
 * This helper avoids clever shortcuts and keeps mutations obvious.
 *
 * @param {Object} intent - Intent object.
 * @returns {Object} Intent object.
 */
function ensureIntent(intent) {
  if (!intent) {
    return {};
  }

  return intent;
}

/**
 * Ensures intent.context exists.
 *
 * @param {Object} intent - Intent object.
 * @returns {Object} Intent object with context.
 */
function ensureIntentContext(intent) {
  var updatedIntent = ensureIntent(intent);

  if (!updatedIntent.context) {
    updatedIntent.context = {};
  }

  return updatedIntent;
}

/**
 * Gets result data safely.
 *
 * @param {Object} intent - Intent object.
 * @returns {Object} Result data.
 */
function getResultData(intent) {
  if (!intent) {
    return {};
  }

  if (!intent.context) {
    return {};
  }

  if (!intent.context.resultData) {
    return {};
  }

  return intent.context.resultData;
}

/**
 * Gets events safely.
 *
 * @param {Object} intent - Intent object.
 * @returns {Array} Events.
 */
function getEvents(intent) {
  if (!intent) {
    return [];
  }

  if (!intent.context) {
    return [];
  }

  if (!intent.context.events) {
    return [];
  }

  if (!Array.isArray(intent.context.events)) {
    return [];
  }

  return intent.context.events;
}

/**
 * Checks whether a result is successful.
 *
 * @param {Object} result - Result object.
 * @returns {boolean} True if successful.
 */
function isSuccess(result) {
  if (!result) {
    return false;
  }

  if (result.ok === true) {
    return true;
  }

  return false;
}

/**
 * Checks whether a result failed.
 *
 * @param {Object} result - Result object.
 * @returns {boolean} True if failed.
 */
function isFailure(result) {
  if (!result) {
    return true;
  }

  if (result.ok === true) {
    return false;
  }

  return true;
}

/**
 * Creates a simple missing field message.
 *
 * @param {string} fieldName - Field name.
 * @returns {string} Error message.
 */
function missingField(fieldName) {
  return "Missing required field: " + fieldName + ".";
}

/**
 * Creates a simple invalid field message.
 *
 * @param {string} fieldName - Field name.
 * @returns {string} Error message.
 */
function invalidField(fieldName) {
  return "Invalid field: " + fieldName + ".";
}

/**
 * Creates a simple permission message.
 *
 * @param {string} reason - Permission reason.
 * @returns {string} Error message.
 */
function permissionDenied(reason) {
  if (!reason) {
    return "Permission denied.";
  }

  return "Permission denied: " + reason;
}

export default {
  success: success,
  successWithMessage: successWithMessage,
  successWithData: successWithData,
  passThrough: passThrough,

  failure: failure,
  stepFailure: stepFailure,
  validationFailure: validationFailure,
  normalizationFailure: normalizationFailure,
  contextFailure: contextFailure,
  authorizationFailure: authorizationFailure,
  processFailure: processFailure,
  emitFailure: emitFailure,

  addResultDataToIntent: addResultDataToIntent,
  addEventToIntent: addEventToIntent,
  addEventsToIntent: addEventsToIntent,
  addContextValue: addContextValue,
  addContextValues: addContextValues,
  replacePayload: replacePayload,
  addPayloadValue: addPayloadValue,

  createEvent: createEvent,
  normalizeErrors: normalizeErrors,
  getResultData: getResultData,
  getEvents: getEvents,

  isSuccess: isSuccess,
  isFailure: isFailure,

  missingField: missingField,
  invalidField: invalidField,
  permissionDenied: permissionDenied
};