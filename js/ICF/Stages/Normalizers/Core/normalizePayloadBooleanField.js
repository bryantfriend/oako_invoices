// ICF/Stages/Normalizers/Core/normalizePayloadBooleanField.js

import resultHelpers from "../../../engine/resultHelpers.js";

/**
 * Creates a normalizer that converts common boolean-like payload values
 * into true or false.
 *
 * Accepted true values:
 * - true
 * - "true"
 * - "yes"
 * - "1"
 * - 1
 *
 * Accepted false values:
 * - false
 * - "false"
 * - "no"
 * - "0"
 * - 0
 *
 * @param {string} fieldName - Payload field name.
 * @returns {Function} Normalizer function.
 */
function createNormalizePayloadBooleanFieldNormalizer(fieldName) {
  function normalizePayloadBooleanField(intent) {
    var rawValue;
    var normalizedString;

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

    if (typeof rawValue === "boolean") {
      return resultHelpers.success(intent);
    }

    if (rawValue === 1) {
      intent.payload[fieldName] = true;
      return resultHelpers.success(intent);
    }

    if (rawValue === 0) {
      intent.payload[fieldName] = false;
      return resultHelpers.success(intent);
    }

    if (typeof rawValue !== "string") {
      return resultHelpers.normalizationFailure(
        "Payload field could not be converted to a boolean: " + fieldName + "."
      );
    }

    normalizedString = rawValue.trim().toLowerCase();

    if (normalizedString === "true") {
      intent.payload[fieldName] = true;
      return resultHelpers.success(intent);
    }

    if (normalizedString === "yes") {
      intent.payload[fieldName] = true;
      return resultHelpers.success(intent);
    }

    if (normalizedString === "1") {
      intent.payload[fieldName] = true;
      return resultHelpers.success(intent);
    }

    if (normalizedString === "false") {
      intent.payload[fieldName] = false;
      return resultHelpers.success(intent);
    }

    if (normalizedString === "no") {
      intent.payload[fieldName] = false;
      return resultHelpers.success(intent);
    }

    if (normalizedString === "0") {
      intent.payload[fieldName] = false;
      return resultHelpers.success(intent);
    }

    return resultHelpers.normalizationFailure(
      "Payload field could not be converted to a boolean: " + fieldName + "."
    );
  }

  return normalizePayloadBooleanField;
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
  createNormalizePayloadBooleanFieldNormalizer: createNormalizePayloadBooleanFieldNormalizer
};