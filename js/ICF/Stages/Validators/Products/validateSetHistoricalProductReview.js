import resultHelpers from "../../../engine/resultHelpers.js";

function validateSetHistoricalProductReview(intent) {
    var payload = intent.payload || {};
    if (!payload.source || typeof payload.source !== 'object' || !payload.key
        || (payload.resolution !== 'unavailable' && payload.resolution !== 'pending')
        || !payload.catalogApi || typeof payload.catalogApi.load !== 'function'
        || !payload.mappingApi || typeof payload.mappingApi.save !== 'function') {
        return resultHelpers.validationFailure('Choose a historical product and a valid review action.');
    }
    return resultHelpers.success(intent);
}
export default { validateSetHistoricalProductReview: validateSetHistoricalProductReview };

