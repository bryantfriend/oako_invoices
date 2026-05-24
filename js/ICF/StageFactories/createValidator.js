// ICF/StageFactories/createValidator.js

import resultHelpers from "../engine/resultHelpers.js";

/**
 * Creates a Validate stage object.
 *
 * This supports a simple authoring pattern while still producing
 * a full stage object that pipeline.js can validate and run.
 *
 * @param {Object} config - Validator configuration.
 * @returns {Object} Validate stage object.
 */
function createValidator(config) {
  validateValidatorConfig(config);

  return {
    id: config.id,
    name: config.name,
    description: config.description,
    stageType: "Validate",

    run: async function run(intent) {
      var checkResult = await config.check(intent);

      return normalizeValidatorResult(intent, checkResult, config.id);
    }
  };
}

function validateValidatorConfig(config) {
  if (!config) {
    throw new Error("createValidator requires a config object.");
  }

  if (!config.id) {
    throw new Error("createValidator requires config.id.");
  }

  if (!config.name) {
    throw new Error("createValidator requires config.name.");
  }

  if (!config.description) {
    throw new Error("createValidator requires config.description.");
  }

  if (typeof config.check !== "function") {
    throw new Error("createValidator requires config.check function.");
  }
}

function normalizeValidatorResult(intent, checkResult, stageId) {
  if (isStageResult(checkResult)) {
    return checkResult;
  }

  if (checkResult === true) {
    return resultHelpers.success(intent);
  }

  if (checkResult === false) {
    return resultHelpers.validationFailure([
      "Validation failed: " + stageId + "."
    ]);
  }

  if (typeof checkResult === "string") {
    return resultHelpers.validationFailure([
      checkResult
    ]);
  }

  if (Array.isArray(checkResult)) {
    return resultHelpers.validationFailure(checkResult);
  }

  return resultHelpers.validationFailure([
    "Validator returned an unsupported result: " + stageId + "."
  ]);
}

function isStageResult(value) {
  if (!value) {
    return false;
  }

  if (typeof value !== "object") {
    return false;
  }

  if (Array.isArray(value)) {
    return false;
  }

  if (value.ok === true) {
    return true;
  }

  if (value.ok === false) {
    return true;
  }

  return false;
}

export { createValidator };

export default {
  createValidator: createValidator
};
