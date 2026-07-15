import { auth } from "../../../../core/firebase.js";
import { i18n } from "../../../../core/i18n.js";
import { settingsService } from "../../../../services/settingsService.js";
import resultHelpers from "../../../engine/resultHelpers.js";

async function addQuickPrintSelectedInvoicesContext(intent) {
  var settings = await settingsService.getInvoiceSettings();
  var context = Object.assign({}, intent.context || {}, {
    currentUser: auth.currentUser,
    settings: settings || {},
    companyId: settings && (settings.storeId || settings.companyId) ? (settings.storeId || settings.companyId) : "",
    language: i18n.getLanguage(),
    printOptions: intent.privateOptions || {}
  });
  return resultHelpers.success(Object.assign({}, intent, {
    context: context
  }));
}

export default {
  addQuickPrintSelectedInvoicesContext: addQuickPrintSelectedInvoicesContext
};
