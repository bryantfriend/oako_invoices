import resultHelpers from "../../../engine/resultHelpers.js";

function emitSetHistoricalProductReview(intent) {
    intent.context.events = [{
        type: 'HistoricalProductReviewChanged', key: intent.payload.key, resolution: intent.payload.resolution
    }];
    return resultHelpers.success(intent);
}
export default { emitSetHistoricalProductReview: emitSetHistoricalProductReview };

