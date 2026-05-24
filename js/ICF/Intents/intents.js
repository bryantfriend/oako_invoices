// ICF/Intents/intents.js

import intentRegistry from "../engine/intentRegistry.js";

import archiveInvoiceIntentModule from "./ArchiveInvoiceIntent.js";
import demoIntentModule from "./DemoIntent.js";

/**
 * Registers all project Intents.
 *
 * Add new Intent registrations here as the project grows.
 *
 * @returns {Object} Registration result.
 */
function registerProjectIntents() {
  return intentRegistry.registerIntents({
    ArchiveInvoiceIntent: archiveInvoiceIntentModule.createArchiveInvoiceIntent,
    DemoIntent: demoIntentModule.createDemoIntent
  });
}

export default {
  registerProjectIntents: registerProjectIntents
};
