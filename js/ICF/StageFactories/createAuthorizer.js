// ICF/StageFactories/createAuthorizer.js

import resultHelpers from "../engine/resultHelpers.js";

/**
 * Creates an Authorize stage object.
 *
 * @param {Object} config - Authorizer configuration.
 * @returns {Object} Authorize stage object.
 */
function createAuthorizer(config) {
  validateAuthorizerConfig(config);

  return {
    id: config.id,
    name: config.name,
    description: config.description,
    stageType: "Authorize",

    run: async function run(intent) {
      var authorizeResult = await config.authorize(intent);

      return normalizeAuthorizerResult(intent, authorizeResult, config.id);
    }
  };
}

function validateAuthorizerConfig(config) {
  if (!config) {
    throw new Error("createAuthorizer requires a config object.");
  }

  if (!config.id) {
    throw new Error("createAuthorizer requires config.id.");
  }

  if (!config.name) {
    throw new Error("createAuthorizer requires config.name.");
  }

  if (!config.description) {
    throw new Error("createAuthorizer requires config.description.");
  }

  if (typeof config.authorize !== "function") {
    throw new Error("createAuthorizer requires config.authorize function.");
  }
}

function normalizeAuthorizerResult(intent, authorizeResult, stageId) {
  if (isStageResult(authorizeResult)) {
    return authorizeResult;
  }

  if (authorizeResult === true) {
    return resultHelpers.success(intent);
  }

  if (authorizeResult === false) {
    return resultHelpers.failure("Authorize", [
      "Authorization failed: " + stageId + "."
    ]);
  }

  if (typeof authorizeResult === "string") {
    return resultHelpers.failure("Authorize", [
      authorizeResult
    ]);
  }

  if (Array.isArray(authorizeResult)) {
    return resultHelpers.failure("Authorize", authorizeResult);
  }

  return resultHelpers.failure("Authorize", [
    "Authorizer returned an unsupported result: " + stageId + "."
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

export { createAuthorizer };

export default {
  createAuthorizer: createAuthorizer
};
