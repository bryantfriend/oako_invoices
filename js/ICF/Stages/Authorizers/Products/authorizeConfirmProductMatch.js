import resultHelpers from "../../../engine/resultHelpers.js";
import { getCategoryProducts } from "../../../../core/productReconciliation.js";
import { findProductCategory } from "../../../../core/productCategories.js";

function authorizeConfirmProductMatch(intent) {
    var roles = ['admin', 'owner', 'manager', 'superadmin', 'super_admin'];
    if (roles.indexOf(String(intent.actor.role || '').toLowerCase()) === -1 || intent.actor.id === 'anonymous') {
        return resultHelpers.authorizationFailure('Only signed-in staff may confirm product matches.');
    }
    var payload = intent.payload;
    var catalog = intent.context.catalog;
    // Resolve historical aliases against the refreshed catalog. If the old
    // category no longer exists, staff explicitly choose its current category.
    var sourceCategory = findProductCategory(payload.source, catalog.categories);
    if (sourceCategory && sourceCategory.id !== payload.categoryId) {
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
