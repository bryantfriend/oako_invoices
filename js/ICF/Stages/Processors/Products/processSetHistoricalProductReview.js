import resultHelpers from "../../../engine/resultHelpers.js";

async function processSetHistoricalProductReview(intent) {
    var payload = intent.payload;
    var entry = {
        key: payload.key, source: payload.source, productId: '', categoryId: '',
        resolution: payload.resolution, confirmedBy: intent.actor.id, confirmedAt: new Date().toISOString()
    };
    intent.context.resultData = await payload.mappingApi.save(entry);
    return resultHelpers.success(intent);
}
export default { processSetHistoricalProductReview: processSetHistoricalProductReview };

