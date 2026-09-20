import resultHelpers from '../../../engine/resultHelpers.js';

function validateRetrySyncPayload(intent) {
    var payload = intent.payload || {};
    if (!Array.isArray(payload.itemIds) || payload.itemIds.length === 0 || payload.itemIds.length > 100 || payload.itemIds.some(function(id) { return typeof id !== 'string' || !id.trim(); })) {
        return resultHelpers.validationFailure('Choose between 1 and 100 saved changes to retry.');
    }
    if (payload.mode !== 'authentication' && payload.mode !== 'manual') {
        return resultHelpers.validationFailure('Unknown retry mode.');
    }
    return resultHelpers.success(intent);
}

export default { validateRetrySyncPayload: validateRetrySyncPayload };
