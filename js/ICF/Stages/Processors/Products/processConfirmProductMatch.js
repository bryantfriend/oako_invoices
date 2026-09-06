import resultHelpers from "../../../engine/resultHelpers.js";

async function processConfirmProductMatch(intent) {
    var payload = intent.payload;
    var entry = {
        key: payload.key, source: payload.source, productId: intent.context.product.id,
        categoryId: payload.categoryId, confirmedBy: intent.actor.id, confirmedAt: new Date().toISOString()
    };
    intent.context.resultData = await payload.mappingApi.save(entry);
    return resultHelpers.success(intent);
}
export default { processConfirmProductMatch: processConfirmProductMatch };
