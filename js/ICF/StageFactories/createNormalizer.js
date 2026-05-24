// ICF/StageFactories/createNormalizer.js

import resultHelpers from "../engine/resultHelpers.js";

/**
 * Creates a Normalize stage object.
 *
 * @param {Object} config - Normalizer configuration.
 * @returns {Object} Normalize stage object.
 */
function createNormalizer(config) {
  validateNormalizerConfig(config);

  return {
    id: config.id,
    name: config.name,
    description: config.description,
    stageType: "Normalize",

    run: async function run(intent) {
      var normalizeResult = await config.normalize(intent);

      return normalizeIntentStageResult(
        normalizeResult,
        "Normalize",
        config.id
      );
    }
  };
}

function validateNormalizerConfig(config) {
  if (!config) {
    throw new Error("createNormalizer requires a config object.");
  }

  if (!config.id) {
    throw new Error("createNormalizer requires config.id.");
  }

  if (!config.name) {
    throw new Error("createNormalizer requires config.name.");
  }

  if (!config.description) {
    throw new Error("createNormalizer requires config.description.");
  }

  if (typeof config.normalize !== "function") {
    throw new Error("createNormalizer requires config.normalize function.");
  }
}

function normalizeIntentStageResult(stageResult, stageName, stageId) {
  if (isStageResult(stageResult)) {
    return stageResult;
  }

  if (isIntentLikeObject(stageResult)) {
    return resultHelpers.success(stageResult);
  }

  return resultHelpers.normalizationFailure([
    stageName + " stage returned an unsupported result: " + stageId + "."
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

function isIntentLikeObject(value) {
  if (!value) {
    return false;
  }

  if (typeof value !== "object") {
    return false;
  }

  if (Array.isArray(value)) {
    return false;
  }

  return true;
}

export { createNormalizer };

export default {
  createNormalizer: createNormalizer
};
