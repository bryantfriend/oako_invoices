import resultHelpers from "../../../engine/resultHelpers.js";
import { findConfirmedProductMatch, reconcileProductRecords } from "../../../../core/productReconciliation.js";

function authorizeSetHistoricalProductReview(intent) {
    var roles = ['admin', 'owner', 'manager', 'superadmin', 'super_admin'];
    if (!intent.actor || !intent.actor.id || intent.actor.id === 'anonymous'
        || roles.indexOf(String(intent.actor.role || '').toLowerCase()) === -1) {
        return resultHelpers.authorizationFailure('Only signed-in staff may review historical products.');
    }
    var payload = intent.payload;
    var catalog = intent.context.catalog;
    var previous = findConfirmedProductMatch(payload.source, catalog.mappings, catalog.categories);
    if (payload.resolution === 'unavailable') {
        var review = reconcileProductRecords([{ items: [{ _catalogSource: payload.source }] }], catalog);
        if (!review.issues.length && (!previous || previous.resolution !== 'unavailable')) {
            return resultHelpers.authorizationFailure('This product is already resolved. Refresh the review list.');
        }
    } else if (!previous || (previous.resolution !== 'unavailable' && previous.resolution !== 'pending')) {
        return resultHelpers.authorizationFailure('This product is not in the deleted review list. Refresh and try again.');
    }
    return resultHelpers.success(intent);
}
export default { authorizeSetHistoricalProductReview: authorizeSetHistoricalProductReview };

