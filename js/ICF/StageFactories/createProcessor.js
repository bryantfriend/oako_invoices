// ICF/StageFactories/createProcessor.js

import resultHelpers from "../engine/resultHelpers.js";

/**
 * Creates a Process stage object.
 *
 * @param {Object} config - Processor configuration.
 * @returns {Object} Process stage object.
 */
function createProcessor(config) {
  validateProcessorConfig(config);

  return {
    id: config.id,
    name: config.name,
    description: config.description,
    stageType: "Process",

    run: async function run(intent) {
      var processResult = await config.process(intent);

      return normalizeProcessorResult(processResult, config.id);
    }
  };
}

function validateProcessorConfig(config) {
  if (!config) {
    throw new Error("createProcessor requires a config object.");
  }

  if (!config.id) {
    throw new Error("createProcessor requires config.id.");
  }

  if (!config.name) {
    throw new Error("createProcessor requires config.name.");
  }

  if (!config.description) {
    throw new Error("createProcessor requires config.description.");
  }

  if (typeof config.process !== "function") {
    throw new Error("createProcessor requires config.process function.");
  }
}

function normalizeProcessorResult(processResult, stageId) {
  if (isStageResult(processResult)) {
    return processResult;
  }

  if (isIntentLikeObject(processResult)) {
    return resultHelpers.success(processResult);
  }

  return resultHelpers.processFailure([
    "Process stage returned an unsupported result: " + stageId + "."
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

export { createProcessor };

export default {
  createProcessor: createProcessor
};
