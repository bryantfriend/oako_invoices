import resultHelpers from "../../../engine/resultHelpers.js";

function emitArchiveSelectedOrdersResult(intent) {
  var result = intent && intent.context ? intent.context.archiveSelectedOrdersResult : null;
  if (!result) {
    return resultHelpers.emitFailure("Bulk archive result is missing.");
  }
  var updatedIntent = resultHelpers.addResultDataToIntent(intent, result);
  updatedIntent = resultHelpers.addEventToIntent(updatedIntent, {
    type: "SelectedOrdersArchived",
    requested: result.requested,
    archived: result.archived,
    failed: result.failed,
    createdAt: Date.now()
  });
  return resultHelpers.success(updatedIntent);
}

export default {
  emitArchiveSelectedOrdersResult: emitArchiveSelectedOrdersResult
};
