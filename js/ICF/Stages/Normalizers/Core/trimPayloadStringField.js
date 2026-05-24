// ICF/Stages/Normalizers/Core/trimPayloadStringField.js

import resultHelpers from "../../../engine/resultHelpers.js";

/**
 * Creates a normalizer that trims a string field inside intent.payload.
 *
 * Example:
 *
 * var trimProductName = createTrimPayloadStringFieldNormalizer("name");
 *
 * @param {string} fieldName - Payload field name.
 * @returns {Function} Normalizer function.
 */
function createTrimPayloadStringFieldNormalizer(fieldName) {
  function trimPayloadStringField(intent) {
    if (!fieldName) {
      return resultHelpers.normalizationFailure("Field name is required.");
    }

    if (!intent) {
      return resultHelpers.normalizationFailure("Intent is required.");
    }

    if (!intent.payload) {
      return resultHelpers.normalizationFailure("Intent payload is required.");
    }

    if (!fieldExists(intent.payload, fieldName)) {
      return resultHelpers.success(intent);
    }

    if (typeof intent.payload[fieldName] !== "string") {
      return resultHelpers.success(intent);
    }

    intent.payload[fieldName] = intent.payload[fieldName].trim();

    return resultHelpers.success(intent);
  }

  return trimPayloadStringField;
}

/**
 * Checks whether an object owns a field.
 *
 * @param {Object} targetObject - Object to check.
 * @param {string} fieldName - Field name.
 * @returns {boolean} True if field exists.
 */
function fieldExists(targetObject, fieldName) {
  if (!targetObject) {
    return false;
  }

  if (Object.prototype.hasOwnProperty.call(targetObject, fieldName)) {
    return true;
  }

  return false;
}

export default {
  createTrimPayloadStringFieldNormalizer: createTrimPayloadStringFieldNormalizer
};