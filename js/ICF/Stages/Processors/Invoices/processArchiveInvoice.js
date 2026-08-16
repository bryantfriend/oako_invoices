// ICF/Stages/Processors/Invoices/processArchiveInvoice.js

import {
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { deviceIdService } from "../../../../services/deviceIdService.js";
import { dataIntegrityService } from "../../../../services/dataIntegrityService.js";
import {
  isArchivedRecord,
  normalizeArchivedRecord
} from "../../../../core/archiveRecordHelpers.js";
import resultHelpers from "../../../engine/resultHelpers.js";

/**
 * Archives an invoice while preserving its previous status.
 *
 * @param {Object} intent - Current Intent.
 * @returns {Object} Process result.
 */
async function processArchiveInvoice(intent) {
  if (!intent) {
    return resultHelpers.processFailure("Intent is required.");
  }

  if (!intent.context) {
    return resultHelpers.processFailure("Intent context is required.");
  }

  if (!intent.context.invoice) {
    return resultHelpers.processFailure("Invoice not found.");
  }

  var storedInvoice = intent.context.invoice;
  var invoice = normalizeArchivedRecord(storedInvoice, "open");

  if (isArchivedRecord(invoice)) {
    return resultHelpers.success(resultHelpers.addContextValue(intent, "archiveResult", {
      invoiceId: intent.payload.invoiceId,
      archived: true,
      transitioned: false,
      status: invoice.status
    }));
  }

  var user = intent.context.currentUser;
  var deviceId = await deviceIdService.getDeviceId();

  await dataIntegrityService.updateInvoiceWithIntegrity(intent.context.invoiceRef, storedInvoice, {
    archived: true,
    archivedAt: serverTimestamp(),
    archivedBy: getActorId(user),
    updatedAt: serverTimestamp(),
    updatedBy: user ? user.uid : "",
    deviceId: deviceId,
    localUpdatedAt: new Date().toISOString(),
    syncState: "synced"
  }, {
    action: "archive",
    actor: intent.actor,
    source: intent.meta && intent.meta.source ? intent.meta.source : "ui"
  });

  var updatedIntent = resultHelpers.addContextValue(
    intent,
    "archiveResult",
    {
      invoiceId: intent.payload.invoiceId,
      archived: true,
      transitioned: true,
      status: invoice.status
    }
  );

  return resultHelpers.success(updatedIntent);
}

/**
 * Returns the best available audit actor value.
 *
 * @param {Object} user - Firebase user.
 * @returns {string} Actor ID or email.
 */
function getActorId(user) {
  if (!user) {
    return "";
  }

  return user.email || user.uid || "";
}

export default {
  processArchiveInvoice: processArchiveInvoice
};
