import { productReconciliationService } from "../services/productReconciliationService.js";
import { getCategoryProducts, getCurrentProductName } from "../core/productReconciliation.js";
import { getCurrentNavigationId, isNavigationStillCurrent } from "../core/routeGuard.js";
import { ROUTES } from "../core/constants.js";

function escapeHtml(value) {
    return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function renderCandidates(context, categoryId) {
    var candidates = getCategoryProducts(context.products, context.categories, categoryId);
    if (!categoryId) { return '<p>Choose a category to see its current products.</p>'; }
    if (!candidates.length) { return '<p>No current products in this category. You can delete this legacy product from review if it is no longer available.</p>'; }
    return candidates.map(function renderCandidate(product) {
        return '<label class="legacy-product-candidate">'
            + '<input type="radio" name="current-product-match" value="' + escapeHtml(product.id) + '">'
            + '<span><strong>' + escapeHtml(getCurrentProductName(product)) + '</strong><small>'
            + escapeHtml(product.sku || product.weight || product.size || ('Product ' + product.id)) + '</small></span></label>';
    }).join('');
}

// Keep the shared mounting entry point for Orders, Daily Orders and Inventory.
// Review is voluntary and lives on its own page; never open a modal here.
function mountProductReconciliation(container, reload, routeName) {
    if (!isNavigationStillCurrent(getCurrentNavigationId(), routeName)) { return false; }
    var oldNotice = container.querySelector('[data-product-reconciliation]');
    if (oldNotice) { oldNotice.remove(); }
    var issues = productReconciliationService.getPendingMatches();
    if (!issues.length) { return false; }
    var notice = document.createElement('aside');
    notice.setAttribute('data-product-reconciliation', '');
    notice.className = 'legacy-review-notice no-print';
    notice.innerHTML = '<span>' + issues.length + ' legacy product name(s) awaiting review. Unreviewed products are excluded from current product totals.</span>'
        + '<a href="#' + ROUTES.LEGACY_PRODUCTS + '">Review when convenient</a>';
    container.appendChild(notice);
    return true;
}

export { mountProductReconciliation, renderCandidates };
