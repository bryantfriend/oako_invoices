// ICF/StageFactories/createContextAdder.js

import resultHelpers from "../engine/resultHelpers.js";

/**
 * Creates an AddContext stage object.
 *
 * @param {Object} config - Context adder configuration.
 * @returns {Object} AddContext stage object.
 */
function createContextAdder(config) {
  validateContextAdderConfig(config);

  return {
    id: config.id,
    name: config.name,
    description: config.description,
    stageType: "AddContext",

    run: async function run(intent) {
      var addResult = await config.add(intent);

      return normalizeContextAdderResult(addResult, config.id);
    }
  };
}

function validateContextAdderConfig(config) {
  if (!config) {
    throw new Error("createContextAdder requires a config object.");
  }

  if (!config.id) {
    throw new Error("createContextAdder requires config.id.");
  }

  if (!config.name) {
    throw new Error("createContextAdder requires config.name.");
  }

  if (!config.description) {
    throw new Error("createContextAdder requires config.description.");
  }

  if (typeof config.add !== "function") {
    throw new Error("createContextAdder requires config.add function.");
  }
}

function normalizeContextAdderResult(addResult, stageId) {
  if (isStageResult(addResult)) {
    return addResult;
  }

  if (isIntentLikeObject(addResult)) {
    return resultHelpers.success(addResult);
  }

  return resultHelpers.contextFailure([
    "AddContext stage returned an unsupported result: " + stageId + "."
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

export { createContextAdder };

export default {
  createContextAdder: createContextAdder
};
