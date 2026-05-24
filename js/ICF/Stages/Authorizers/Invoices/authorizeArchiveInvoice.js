// ICF/Stages/Authorizers/Invoices/authorizeArchiveInvoice.js

import resultHelpers from "../../../engine/resultHelpers.js";

/**
 * Authorizes ArchiveInvoiceIntent.
 *
 * Existing app behavior treats signed-in users as admins. This keeps that
 * legacy behavior while allowing future superadmin roles in the actor.
 *
 * @param {Object} intent - Current Intent.
 * @returns {Object} Authorization result.
 */
function authorizeArchiveInvoice(intent) {
  if (!intent) {
    return resultHelpers.authorizationFailure("Intent is required.");
  }

  if (!intent.context) {
    return resultHelpers.authorizationFailure("Intent context is required.");
  }

  if (!intent.context.currentUser) {
    return resultHelpers.authorizationFailure("Only admins can archive invoices.");
  }

  if (!isAdminActor(intent.actor)) {
    return resultHelpers.authorizationFailure("Only admins can archive invoices.");
  }

  if (!isWithinScope(intent)) {
    return resultHelpers.authorizationFailure("You do not have access to archive this invoice.");
  }

  return resultHelpers.success(intent);
}

/**
 * Checks the role carried by the Intent actor.
 *
 * @param {Object} actor - Intent actor.
 * @returns {boolean} True when admin or superadmin.
 */
function isAdminActor(actor) {
  if (!actor) {
    return false;
  }

  if (actor.role === "admin") {
    return true;
  }

  if (actor.role === "superadmin") {
    return true;
  }

  return false;
}

/**
 * Keeps archive authorization aligned with existing store/company fields.
 *
 * If either side has no scope yet, legacy records are allowed through.
 *
 * @param {Object} intent - Current Intent.
 * @returns {boolean} True when scopes are compatible.
 */
function isWithinScope(intent) {
  var invoice = intent.context.invoice;
  var settings = intent.context.settings || {};
  var scopeId = settings.storeId || settings.companyId || "";
  var invoiceScopeId = "";

  if (invoice) {
    invoiceScopeId = invoice.storeId || invoice.companyId || "";
  }

  if (!scopeId) {
    return true;
  }

  if (!invoiceScopeId) {
    return true;
  }

  return scopeId === invoiceScopeId;
}

export default {
  authorizeArchiveInvoice: authorizeArchiveInvoice
};
