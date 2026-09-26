import resultHelpers from '../../../engine/resultHelpers.js';
function emitInventoryMutationResult(intent) {
    var results = intent.context.inventoryResults;
    var failed = results.filter(function failedRecord(record) { return !record.ok; });
    return resultHelpers.success(resultHelpers.addResultDataToIntent(intent, { ok: failed.length === 0, results: results, failed: failed }));
}
export default { emitInventoryMutationResult: emitInventoryMutationResult };
