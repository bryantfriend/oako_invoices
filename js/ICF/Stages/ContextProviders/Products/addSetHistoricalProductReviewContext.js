import resultHelpers from "../../../engine/resultHelpers.js";

async function addSetHistoricalProductReviewContext(intent) {
    intent.context.catalog = await intent.payload.catalogApi.load();
    return resultHelpers.success(intent);
}
export default { addSetHistoricalProductReviewContext: addSetHistoricalProductReviewContext };

