// ICF/Stages/Normalizers/Core/normalizePayloadNumberField.js

import resultHelpers from "../../../engine/resultHelpers.js";

/**
 * Creates a normalizer that converts a payload field into a number.
 *
 * Example:
 *
 * var normalizePrice = createNormalizePayloadNumberFieldNormalizer("price");
 *
 * @param {string} fieldName - Payload field name.
 * @returns {Function} Normalizer function.
 */
function createNormalizePayloadNumberFieldNormalizer(fieldName) {
  function normalizePayloadNumberField(intent) {
    var rawValue;
    var normalizedValue;

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

    if (rawValue === "") {
      return resultHelpers.success(intent);
    }

    if (rawValue === null) {
      return resultHelpers.success(intent);
    }

    if (typeof rawValue === "number") {
      return resultHelpers.success(intent);
    }

    normalizedValue = Number(rawValue);

    if (Number.isNaN(normalizedValue)) {
      return resultHelpers.normalizationFailure(
        "Payload field could not be converted to a number: " + fieldName + "."
      );
    }

    intent.payload[fieldName] = normalizedValue;

    return resultHelpers.success(intent);
  }

  return normalizePayloadNumberField;
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
  createNormalizePayloadNumberFieldNormalizer: createNormalizePayloadNumberFieldNormalizer
};