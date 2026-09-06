import resultHelpers from "../../../engine/resultHelpers.js";
import { getCategoryProducts } from "../../../../core/productReconciliation.js";

function authorizeConfirmProductMatch(intent) {
    var roles = ['admin', 'owner', 'manager', 'superadmin', 'super_admin'];
    if (roles.indexOf(String(intent.actor.role || '').toLowerCase()) === -1 || intent.actor.id === 'anonymous') {
        return resultHelpers.authorizationFailure('Only signed-in staff may confirm product matches.');
    }
    var payload = intent.payload;
    var catalog = intent.context.catalog;
    if (payload.source.categoryId && payload.source.categoryId !== payload.categoryId) {
        return resultHelpers.authorizationFailure('Choose a product from the historical item’s category.');
    }
    var candidates = getCategoryProducts(catalog.products, catalog.categories, payload.categoryId);
    var product = candidates.find(function(candidate) {
        return candidate.id === payload.productId && candidate.archived !== true && candidate.active !== false;
    });
    if (!product) {
        return resultHelpers.authorizationFailure('That product is no longer available in this category. Refresh the product list.');
    }
    intent.context.product = product;
    return resultHelpers.success(intent);
}
export default { authorizeConfirmProductMatch: authorizeConfirmProductMatch };
