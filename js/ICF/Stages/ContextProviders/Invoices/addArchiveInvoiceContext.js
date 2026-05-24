// ICF/Stages/ContextProviders/Invoices/addArchiveInvoiceContext.js

import { auth, db } from "../../../../core/firebase.js";
import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { settingsService } from "../../../../services/settingsService.js";
import resultHelpers from "../../../engine/resultHelpers.js";

var COLLECTION = "invoices";

/**
 * Adds trusted Firestore, invoice, user, and scope context.
 *
 * @param {Object} intent - Current Intent.
 * @returns {Object} Context result.
 */
async function addArchiveInvoiceContext(intent) {
  if (!intent) {
    return resultHelpers.contextFailure("Intent is required.");
  }

  if (!intent.payload) {
    return resultHelpers.contextFailure("Intent payload is required.");
  }

  var invoiceId = intent.payload.invoiceId;
  var invoiceRef = doc(db, COLLECTION, invoiceId);
  var invoiceSnapshot = await getDoc(invoiceRef);
  var invoice = null;
  var settings = await getInvoiceSettingsSafely();

  if (invoiceSnapshot.exists()) {
    invoice = Object.assign(
      {
        id: invoiceSnapshot.id
      },
      invoiceSnapshot.data()
    );
  }

  var updatedIntent = resultHelpers.addContextValues(intent, {
    currentUser: auth.currentUser,
    invoiceRef: invoiceRef,
    invoice: invoice,
    settings: settings
  });

  return resultHelpers.success(updatedIntent);
}

/**
 * Loads invoice settings without blocking archive recovery on settings failures.
 *
 * @returns {Object} Invoice settings or an empty fallback object.
 */
async function getInvoiceSettingsSafely() {
  try {
    return await settingsService.getInvoiceSettings();
  } catch (error) {
    console.warn("Could not load invoice settings for archive authorization.", error);
    return {};
  }
}

export default {
  addArchiveInvoiceContext: addArchiveInvoiceContext
};
