// ICF/Stages/Emitters/Core/addResultMessage.js

import resultHelpers from "../../../engine/resultHelpers.js";

/**
 * Creates an emitter that adds a message to intent.context.resultData.
 *
 * Example:
 *
 * var addToastMessage = createAddResultMessageEmitter(
 *   "toastMessage",
 *   "Product saved."
 * );
 *
 * @param {string} messageKey - Result data key.
 * @param {string} message - Message value.
 * @returns {Function} Emitter function.
 */
function createAddResultMessageEmitter(messageKey, message) {
  function addResultMessage(intent) {
    if (!messageKey) {
      return resultHelpers.emitFailure("Message key is required.");
    }

    if (!message) {
      return resultHelpers.emitFailure("Message is required.");
    }

    if (!intent) {
      return resultHelpers.emitFailure("Intent is required.");
    }

    var currentResultData = resultHelpers.getResultData(intent);
    var updatedResultData = copyObject(currentResultData);

    updatedResultData[messageKey] = message;

    var updatedIntent = resultHelpers.addResultDataToIntent(intent, updatedResultData);

    return resultHelpers.success(updatedIntent);
  }

  return addResultMessage;
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
  createAddResultMessageEmitter: createAddResultMessageEmitter
};