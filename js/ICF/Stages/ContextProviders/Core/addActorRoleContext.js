// ICF/Stages/ContextProviders/Core/addActorRoleContext.js

import resultHelpers from "../../../engine/resultHelpers.js";

/**
 * Adds actor role context from intent.actor.role.
 *
 * This is basic convenience context.
 *
 * Important:
 * For high-security apps, the actor role should usually be verified from
 * a trusted server session, Firebase custom claims, or a database record.
 *
 * @param {Object} intent - Current Intent.
 * @returns {Object} Context result.
 */
function addActorRoleContext(intent) {
  if (!intent) {
    return resultHelpers.contextFailure("Intent is required.");
  }

  if (!intent.actor) {
    return resultHelpers.contextFailure("Intent actor is required.");
  }

  if (!intent.actor.role) {
    return resultHelpers.contextFailure("Intent actor.role is required.");
  }

  var updatedIntent = resultHelpers.addContextValue(
    intent,
    "actorRole",
    intent.actor.role
  );

  return resultHelpers.success(updatedIntent);
}

export default {
  addActorRoleContext: addActorRoleContext
};