import { auth } from "../../../../core/firebase.js";
import resultHelpers from "../../../engine/resultHelpers.js";

function addArchiveSelectedOrdersContext(intent) {
  var privateOptions = intent && intent.privateOptions ? intent.privateOptions : {};
  var archiveApi = privateOptions.archiveApi;
  if (!archiveApi || typeof archiveApi.archiveOrder !== "function") {
    return resultHelpers.contextFailure("Order archive service is required.");
  }
  var updatedIntent = resultHelpers.addContextValues(intent, {
    currentUser: auth.currentUser,
    archiveApi: archiveApi,
    onProgress: privateOptions.onProgress
  });
  return resultHelpers.success(updatedIntent);
}

export default {
  addArchiveSelectedOrdersContext: addArchiveSelectedOrdersContext
};
