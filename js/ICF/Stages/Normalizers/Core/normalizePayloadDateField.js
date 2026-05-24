// ICF/Stages/Normalizers/Core/normalizePayloadDateField.js

import resultHelpers from "../../../engine/resultHelpers.js";

/**
 * Creates a normalizer that converts a payload date field into an ISO string.
 *
 * Example:
 *
 * var normalizeDueDate = createNormalizePayloadDateFieldNormalizer("dueDate");
 *
 * @param {string} fieldName - Payload field name.
 * @returns {Function} Normalizer function.
 */
function createNormalizePayloadDateFieldNormalizer(fieldName) {
  function normalizePayloadDateField(intent) {
    var rawValue;
    var dateValue;

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

    rawValue = intent.payload[fieldName];

    if (!rawValue) {
      return resultHelpers.success(intent);
    }

    dateValue = new Date(rawValue);

    if (Number.isNaN(dateValue.getTime())) {
      return resultHelpers.normalizationFailure(
        "Payload field could not be converted to a date: " + fieldName + "."
      );
    }

    intent.payload[fieldName] = dateValue.toISOString();

    return resultHelpers.success(intent);
  }

  return normalizePayloadDateField;
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
  createNormalizePayloadDateFieldNormalizer: createNormalizePayloadDateFieldNormalizer
};