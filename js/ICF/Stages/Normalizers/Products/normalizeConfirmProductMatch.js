import resultHelpers from "../../../engine/resultHelpers.js";
import { getProductMatchKey } from "../../../../core/productReconciliation.js";

function normalizeConfirmProductMatch(intent) {
    var payload = intent.payload;
    intent.payload = Object.assign({}, payload, {
        productId: String(payload.productId).trim(),
        categoryId: String(payload.categoryId).trim(),
        key: getProductMatchKey(payload.source)
    });
    return resultHelpers.success(intent);
}
export default { normalizeConfirmProductMatch: normalizeConfirmProductMatch };
