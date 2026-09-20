import resultHelpers from '../../../engine/resultHelpers.js';

function emitRetrySyncResult(intent) {
    return resultHelpers.success(resultHelpers.addResultDataToIntent(intent, intent.context.retryResult));
}

export default { emitRetrySyncResult: emitRetrySyncResult };
