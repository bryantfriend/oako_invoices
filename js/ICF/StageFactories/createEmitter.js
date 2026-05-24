// ICF/StageFactories/createEmitter.js

import resultHelpers from "../engine/resultHelpers.js";

/**
 * Creates an Emit stage object.
 *
 * @param {Object} config - Emitter configuration.
 * @returns {Object} Emit stage object.
 */
function createEmitter(config) {
  validateEmitterConfig(config);

  return {
    id: config.id,
    name: config.name,
    description: config.description,
    stageType: "Emit",

    run: async function run(intent) {
      var emitResult = await config.emit(intent);

      return normalizeEmitterResult(emitResult, config.id);
    }
  };
}

function validateEmitterConfig(config) {
  if (!config) {
    throw new Error("createEmitter requires a config object.");
  }

  if (!config.id) {
    throw new Error("createEmitter requires config.id.");
  }

  if (!config.name) {
    throw new Error("createEmitter requires config.name.");
  }

  if (!config.description) {
    throw new Error("createEmitter requires config.description.");
  }

  if (typeof config.emit !== "function") {
    throw new Error("createEmitter requires config.emit function.");
  }
}

function normalizeEmitterResult(emitResult, stageId) {
  if (isStageResult(emitResult)) {
    return emitResult;
  }

  if (isIntentLikeObject(emitResult)) {
    return resultHelpers.success(emitResult);
  }

  return resultHelpers.emitFailure([
    "Emit stage returned an unsupported result: " + stageId + "."
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

export { createEmitter };

export default {
  createEmitter: createEmitter
};
