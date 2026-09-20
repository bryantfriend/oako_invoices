import resultHelpers from "../../../engine/resultHelpers.js";
import { getProductMatchKey } from "../../../../core/productReconciliation.js";

function normalizeSetHistoricalProductReview(intent) {
    var payload = intent.payload;
    var source = {};
    ['productId', 'name', 'categoryId', 'categoryName'].forEach(function copySourceField(field) {
        source[field] = String(payload.source[field] || '');
    });
    intent.payload = Object.assign({}, payload, { source: source, key: getProductMatchKey(source) });
    return resultHelpers.success(intent);
}
export default { normalizeSetHistoricalProductReview: normalizeSetHistoricalProductReview };

