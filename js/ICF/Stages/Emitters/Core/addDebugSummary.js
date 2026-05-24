// ICF/Stages/Emitters/Core/addDebugSummary.js

import resultHelpers from "../../../engine/resultHelpers.js";

/**
 * Adds a debug summary to resultData.
 *
 * Important:
 * This should not be used for sensitive production actions unless reviewed.
 * Do not include passwords, private messages, payment details, tokens, or secrets.
 *
 * @param {Object} intent - Current Intent.
 * @returns {Object} Emit result.
 */
function addDebugSummary(intent) {
  if (!intent) {
    return resultHelpers.emitFailure("Intent is required.");
  }

  var currentResultData = resultHelpers.getResultData(intent);
  var updatedResultData = copyObject(currentResultData);

  updatedResultData.debugSummary = buildDebugSummary(intent);

  var updatedIntent = resultHelpers.addResultDataToIntent(intent, updatedResultData);

  return resultHelpers.success(updatedIntent);
}

/**
 * Builds a safe debug summary.
 *
 * @param {Object} intent - Current Intent.
 * @returns {Object} Debug summary.
 */
function buildDebugSummary(intent) {
  return {
    intentType: getIntentType(intent),
    actorId: getActorId(intent),
    actorRole: getActorRole(intent),
    payloadKeys: getObjectKeys(intent.payload),
    contextKeys: getObjectKeys(intent.context),
    eventCount: resultHelpers.getEvents(intent).length
  };
}

/**
 * Gets the Intent type safely.
 *
 * @param {Object} intent - Current Intent.
 * @returns {string} Intent type.
 */
function getIntentType(intent) {
  if (!intent) {
    return "unknown";
  }

  if (!intent.type) {
    return "unknown";
  }

  return intent.type;
}

/**
 * Gets actor ID safely.
 *
 * @param {Object} intent - Current Intent.
 * @returns {string} Actor ID.
 */
function getActorId(intent) {
  if (!intent) {
    return "unknown";
  }

  if (!intent.actor) {
    return "unknown";
  }

  if (!intent.actor.id) {
    return "unknown";
  }

  return intent.actor.id;
}

/**
 * Gets actor role safely.
 *
 * @param {Object} intent - Current Intent.
 * @returns {string} Actor role.
 */
function getActorRole(intent) {
  if (!intent) {
    return "unknown";
  }

  if (!intent.actor) {
    return "unknown";
  }

  if (!intent.actor.role) {
    return "unknown";
  }

  return intent.actor.role;
}

/**
 * Gets object keys safely.
 *
 * @param {Object} targetObject - Object to inspect.
 * @returns {Array} Object keys.
 */
function getObjectKeys(targetObject) {
  if (!targetObject) {
    return [];
  }

  if (typeof targetObject !== "object") {
    return [];
  }

  if (Array.isArray(targetObject)) {
    return [];
  }

  return Object.keys(targetObject);
}

/**
 * Creates a shallow copy of a plain object.
 *
 * @param {Object} sourceObject - Object to copy.
 * @returns {Object} Copied object.
 */
function copyObject(sourceObject) {
  var copiedObject = {};

  if (!sourceObject) {
    return copiedObject;
  }

  var keys = Object.keys(sourceObject);
  var keyIndex = 0;

  while (keyIndex < keys.length) {
    var key = keys[keyIndex];
    copiedObject[key] = sourceObject[key];

    keyIndex = keyIndex + 1;
  }

  return copiedObject;
}

export default {
  addDebugSummary: addDebugSummary
};