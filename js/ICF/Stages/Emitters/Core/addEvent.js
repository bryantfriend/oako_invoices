// ICF/Stages/Emitters/Core/addEvent.js

import resultHelpers from "../../../engine/resultHelpers.js";

/**
 * Creates an emitter that adds a standard event to intent.context.events.
 *
 * Example:
 *
 * var emitProductCreated = createAddEventEmitter(
 *   "ProductCreated",
 *   {
 *     source: "CreateProductIntent"
 *   }
 * );
 *
 * @param {string} eventType - Event type.
 * @param {Object} eventData - Event data.
 * @returns {Function} Emitter function.
 */
function createAddEventEmitter(eventType, eventData) {
  function addEvent(intent) {
    if (!eventType) {
      return resultHelpers.emitFailure("Event type is required.");
    }

    if (!intent) {
      return resultHelpers.emitFailure("Intent is required.");
    }

    var safeEventData = buildEventData(intent, eventData);
    var event = resultHelpers.createEvent(eventType, safeEventData);
    var updatedIntent = resultHelpers.addEventToIntent(intent, event);

    return resultHelpers.success(updatedIntent);
  }

  return addEvent;
}

/**
 * Builds event data safely.
 *
 * Static event data is copied.
 * Basic intent metadata is included to improve traceability.
 *
 * @param {Object} intent - Current Intent.
 * @param {Object} eventData - Static event data.
 * @returns {Object} Event data.
 */
function buildEventData(intent, eventData) {
  var safeEventData = {};

  copyObjectIntoTarget(safeEventData, eventData);

  if (intent.type) {
    safeEventData.intentType = intent.type;
  }

  if (intent.actor) {
    if (intent.actor.id) {
      safeEventData.actorId = intent.actor.id;
    }

    if (intent.actor.role) {
      safeEventData.actorRole = intent.actor.role;
    }
  }

  return safeEventData;
}

/**
 * Copies fields from source object into target object.
 *
 * @param {Object} targetObject - Target object.
 * @param {Object} sourceObject - Source object.
 */
function copyObjectIntoTarget(targetObject, sourceObject) {
  if (!sourceObject) {
    return;
  }

  if (typeof sourceObject !== "object") {
    return;
  }

  if (Array.isArray(sourceObject)) {
    return;
  }

  var keys = Object.keys(sourceObject);
  var keyIndex = 0;

  while (keyIndex < keys.length) {
    var key = keys[keyIndex];
    targetObject[key] = sourceObject[key];

    keyIndex = keyIndex + 1;
  }
}

export default {
  createAddEventEmitter: createAddEventEmitter
};