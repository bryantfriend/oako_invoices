// ICF/Stages/Validators/Core/requireBaseIntentShape.js

import resultHelpers from "../../../engine/resultHelpers.js";

/**
 * Requires the basic shape that every ICF Intent must have.
 *
 * This validator is intended to reduce repetition inside Intent files.
 *
 * Instead of writing:
 *
 * Validate: {
 *   requireIntentType: validators.requireIntentType,
 *   requireActor: validators.requireActor,
 *   requirePayload: validators.requirePayload,
 *   requireContext: validators.requireContext
 * }
 *
 * You can write:
 *
 * Validate: {
 *   requireBaseIntentShape: validators.requireBaseIntentShape
 * }
 *
 * This checks:
 * - intent exists
 * - intent.type exists
 * - intent.type is a string
 * - intent.actor exists
 * - intent.actor is an object
 * - intent.actor.id exists
 * - intent.actor.role exists
 * - intent.payload exists
 * - intent.payload is an object
 * - intent.context exists
 * - intent.context is an object
 * - intent.stages exists
 * - intent.stages is an object
 *
 * @param {Object} intent - Current Intent.
 * @returns {Object} Validation result.
 */
function requireBaseIntentShape(intent) {
  var errors = [];

  validateIntentExists(errors, intent);

  if (errors.length > 0) {
    return resultHelpers.validationFailure(errors);
  }

  validateIntentType(errors, intent);
  validateActor(errors, intent);
  validatePayload(errors, intent);
  validateContext(errors, intent);
  validateStages(errors, intent);

  if (errors.length > 0) {
    return resultHelpers.validationFailure(errors);
  }

  return resultHelpers.success(intent);
}

/**
 * Validates that the Intent exists.
 *
 * @param {Array} errors - Shared error list.
 * @param {Object} intent - Current Intent.
 */
function validateIntentExists(errors, intent) {
  if (!intent) {
    errors.push("Intent is required.");
  }
}

/**
 * Validates intent.type.
 *
 * @param {Array} errors - Shared error list.
 * @param {Object} intent - Current Intent.
 */
function validateIntentType(errors, intent) {
  if (!intent.type) {
    errors.push(resultHelpers.missingField("intent.type"));
    return;
  }

  if (typeof intent.type !== "string") {
    errors.push("Invalid field: intent.type must be a string.");
    return;
  }

  if (intent.type.trim() === "") {
    errors.push("Invalid field: intent.type must not be empty.");
  }
}

/**
 * Validates intent.actor.
 *
 * Expected shape:
 *
 * actor: {
 *   id: "user_123",
 *   role: "admin"
 * }
 *
 * @param {Array} errors - Shared error list.
 * @param {Object} intent - Current Intent.
 */
function validateActor(errors, intent) {
  if (!intent.actor) {
    errors.push(resultHelpers.missingField("intent.actor"));
    return;
  }

  if (typeof intent.actor !== "object") {
    errors.push("Invalid field: intent.actor must be an object.");
    return;
  }

  if (Array.isArray(intent.actor)) {
    errors.push("Invalid field: intent.actor must not be an array.");
    return;
  }

  validateActorId(errors, intent.actor);
  validateActorRole(errors, intent.actor);
}

/**
 * Validates intent.actor.id.
 *
 * @param {Array} errors - Shared error list.
 * @param {Object} actor - Intent actor.
 */
function validateActorId(errors, actor) {
  if (!actor.id) {
    errors.push(resultHelpers.missingField("intent.actor.id"));
    return;
  }

  if (typeof actor.id !== "string") {
    errors.push("Invalid field: intent.actor.id must be a string.");
    return;
  }

  if (actor.id.trim() === "") {
    errors.push("Invalid field: intent.actor.id must not be empty.");
  }
}

/**
 * Validates intent.actor.role.
 *
 * @param {Array} errors - Shared error list.
 * @param {Object} actor - Intent actor.
 */
function validateActorRole(errors, actor) {
  if (!actor.role) {
    errors.push(resultHelpers.missingField("intent.actor.role"));
    return;
  }

  if (typeof actor.role !== "string") {
    errors.push("Invalid field: intent.actor.role must be a string.");
    return;
  }

  if (actor.role.trim() === "") {
    errors.push("Invalid field: intent.actor.role must not be empty.");
  }
}

/**
 * Validates intent.payload.
 *
 * Payload is not trusted yet.
 * This only confirms that payload exists and has the correct basic shape.
 *
 * @param {Array} errors - Shared error list.
 * @param {Object} intent - Current Intent.
 */
function validatePayload(errors, intent) {
  if (!intent.payload) {
    errors.push(resultHelpers.missingField("intent.payload"));
    return;
  }

  if (typeof intent.payload !== "object") {
    errors.push("Invalid field: intent.payload must be an object.");
    return;
  }

  if (Array.isArray(intent.payload)) {
    errors.push("Invalid field: intent.payload must not be an array.");
  }
}

/**
 * Validates intent.context.
 *
 * Context starts as an object.
 * Trusted data should be added later during AddContext.
 *
 * @param {Array} errors - Shared error list.
 * @param {Object} intent - Current Intent.
 */
function validateContext(errors, intent) {
  if (!intent.context) {
    errors.push(resultHelpers.missingField("intent.context"));
    return;
  }

  if (typeof intent.context !== "object") {
    errors.push("Invalid field: intent.context must be an object.");
    return;
  }

  if (Array.isArray(intent.context)) {
    errors.push("Invalid field: intent.context must not be an array.");
  }
}

/**
 * Validates intent.stages.
 *
 * Deeper stage validation still belongs in pipeline.js.
 * This only confirms that stages exists and has the correct basic shape.
 *
 * @param {Array} errors - Shared error list.
 * @param {Object} intent - Current Intent.
 */
function validateStages(errors, intent) {
  if (!intent.stages) {
    errors.push(resultHelpers.missingField("intent.stages"));
    return;
  }

  if (typeof intent.stages !== "object") {
    errors.push("Invalid field: intent.stages must be an object.");
    return;
  }

  if (Array.isArray(intent.stages)) {
    errors.push("Invalid field: intent.stages must not be an array.");
  }
}

export default {
  requireBaseIntentShape: requireBaseIntentShape
};