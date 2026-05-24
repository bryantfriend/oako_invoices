// ICF/Stages/Emitters/Core/addSuccessMessage.js

import resultHelpers from "../../../engine/resultHelpers.js";

/**
 * Creates an emitter that adds a success message to resultData.
 *
 * Example:
 *
 * var emitProductCreatedMessage = createAddSuccessMessageEmitter(
 *   "Product created successfully."
 * );
 *
 * @param {string} message - Success message.
 * @returns {Function} Emitter function.
 */
function createAddSuccessMessageEmitter(message) {
  function addSuccessMessage(intent) {
    if (!message) {
      return resultHelpers.emitFailure("Success message is required.");
    }

    if (!intent) {
      return resultHelpers.emitFailure("Intent is required.");
    }

    var currentResultData = resultHelpers.getResultData(intent);
    var updatedResultData = copyObject(currentResultData);

    updatedResultData.message = message;

    var updatedIntent = resultHelpers.addResultDataToIntent(intent, updatedResultData);

    return resultHelpers.success(updatedIntent);
  }

  return addSuccessMessage;
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
  createAddSuccessMessageEmitter: createAddSuccessMessageEmitter
};