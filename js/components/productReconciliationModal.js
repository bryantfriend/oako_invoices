import { Modal } from "./modal.js";
import { productReconciliationService } from "../services/productReconciliationService.js";
import { getCategoryProducts, getCurrentProductName } from "../core/productReconciliation.js";
import { getCurrentNavigationId, isNavigationStillCurrent } from "../core/routeGuard.js";

var activeModal = null;
var activeNavigation = -1;
var promptedNavigation = -1;

function escapeHtml(value) {
    return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function renderCandidates(context, categoryId) {
    var candidates = getCategoryProducts(context.products, context.categories, categoryId);
    if (!categoryId) { return '<p>Choose the category to see its current products.</p>'; }
    if (!candidates.length) { return '<p>No current products in this category. Skip this name and check the website catalog.</p>'; }
    return candidates.map(function(product) {
        return '<label style="display:flex;align-items:center;gap:12px;border:1px solid #cbd5e1;padding:12px;border-radius:8px;cursor:pointer">'
            + '<input type="radio" name="current-product-match" value="' + escapeHtml(product.id) + '">'
            + (product.imageUrl ? '<img src="' + escapeHtml(product.imageUrl) + '" alt="" style="width:44px;height:44px;object-fit:cover;border-radius:6px">' : '')
            + '<span><strong>' + escapeHtml(getCurrentProductName(product)) + '</strong><small style="display:block;color:#64748b">'
            + escapeHtml(product.sku || product.weight || product.size || ('Product ' + product.id)) + '</small></span></label>';
    }).join('');
}

function mountProductReconciliation(container, reload, routeName) {
    var navigationId = getCurrentNavigationId();
    if (!isNavigationStillCurrent(navigationId, routeName)) { return false; }
    if (activeModal && activeNavigation !== navigationId) { activeModal.close(); activeModal = null; }
    var oldNotice = container.querySelector('[data-product-reconciliation]');
    if (oldNotice) { oldNotice.remove(); }
    var issues = productReconciliationService.getPendingMatches();
    if (!issues.length) { return false; }
    var notice = document.createElement('section');
    notice.setAttribute('data-product-reconciliation', '');
    notice.setAttribute('role', 'status');
    notice.style.cssText = 'padding:16px;margin-bottom:16px;border:1px solid #f59e0b;border-radius:10px;background:#fffbeb;color:#78350f;display:flex;gap:16px;align-items:center;justify-content:space-between;flex-wrap:wrap';
    notice.innerHTML = '<div><strong>' + issues.length + ' historical product names need a match</strong>'
        + '<p>Product totals and stock exclude unmatched items and are incomplete until you confirm their current products.</p></div>'
        + '<button class="btn btn-primary" type="button">Match products</button>';
    container.prepend(notice);

    function openMatches() {
        if (activeModal) { return; }
        var skipped = new Set();
        var changed = false;

        async function finish() {
            if (activeModal && activeNavigation === navigationId) { activeModal.close(); activeModal = null; }
            if (changed && isNavigationStillCurrent(navigationId, routeName)) { await reload(); }
        }

        function showNext() {
            if (!isNavigationStillCurrent(navigationId, routeName)) { finish(); return; }
            var pending = productReconciliationService.getPendingMatches().filter(function(issue) { return !skipped.has(issue.key); });
            if (!pending.length) { finish(); return; }
            var issue = pending[0];
            var context = productReconciliationService.getContext();
            var categoryId = issue.source.categoryId;
            var category = context.categories.find(function(entry) { return entry.id === categoryId; });
            var categoryControl = category
                ? '<p>Category: <strong>' + escapeHtml(category.name) + '</strong></p>'
                : '<label>Choose this historical item’s category<select id="product-match-category" class="form-control"><option value="">Select category</option>'
                    + context.categories.map(function(entry) { return '<option value="' + escapeHtml(entry.id) + '">' + escapeHtml(entry.name) + '</option>'; }).join('') + '</select></label>';
            var modal = new Modal({
                title: 'Match historical product', footer: false, size: 'large', closeOnBackdrop: false, closeOnEsc: false,
                content: '<div style="display:grid;gap:16px">'
                    + '<p>Choose the current website product for <strong>“' + escapeHtml(issue.source.name || 'Unnamed historical item') + '”</strong>.</p>'
                    + (!issue.source.name && issue.source.productId ? '<p>Historical product reference: ' + escapeHtml(issue.source.productId) + '</p>' : '')
                    + '<p>' + issue.occurrences + ' matching line(s). This confirmation will be reused when this historical item appears again.</p>'
                    + categoryControl
                    + '<div id="product-match-candidates" style="display:grid;gap:8px;max-height:340px;overflow:auto">' + renderCandidates(context, categoryId) + '</div>'
                    + '<p id="product-match-error" role="alert" style="color:#b91c1c"></p>'
                    + '<div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap"><button id="product-match-later" class="btn btn-secondary">Later</button>'
                    + '<button id="product-match-skip" class="btn btn-secondary">Skip this name</button><button id="product-match-confirm" class="btn btn-primary" disabled>Confirm product</button></div></div>'
            });
            activeModal = modal;
            activeNavigation = navigationId;
            modal.open();
            var element = modal.modalEl;
            element.setAttribute('role', 'dialog');
            element.setAttribute('aria-modal', 'true');
            element.setAttribute('aria-label', 'Match historical product');
            var confirm = element.querySelector('#product-match-confirm');
            var later = element.querySelector('#product-match-later');
            var skip = element.querySelector('#product-match-skip');
            var candidatesMount = element.querySelector('#product-match-candidates');
            var categorySelect = element.querySelector('#product-match-category');
            candidatesMount.addEventListener('change', function selectProduct() { confirm.disabled = !element.querySelector('input[name="current-product-match"]:checked'); });
            if (categorySelect) {
                categorySelect.addEventListener('change', function selectCategory() {
                    categoryId = categorySelect.value;
                    candidatesMount.innerHTML = renderCandidates(context, categoryId);
                    confirm.disabled = true;
                });
            }
            later.addEventListener('click', finish);
            skip.addEventListener('click', function skipName() { skipped.add(issue.key); modal.close(); activeModal = null; showNext(); });
            confirm.addEventListener('click', async function confirmProduct() {
                var selected = element.querySelector('input[name="current-product-match"]:checked');
                if (!selected) { return; }
                confirm.disabled = true; later.disabled = true; skip.disabled = true;
                confirm.textContent = 'Saving…';
                try {
                    await productReconciliationService.confirmMatch(issue, selected.value, categoryId);
                    changed = true;
                    if (activeModal !== modal) { return; }
                    modal.close(); activeModal = null; showNext();
                } catch (error) {
                    element.querySelector('#product-match-error').textContent = error.message || 'Could not save. Please try again.';
                    confirm.disabled = false; later.disabled = false; skip.disabled = false;
                    confirm.textContent = 'Confirm product';
                }
            });
        }
        showNext();
    }
    notice.querySelector('button').addEventListener('click', openMatches);
    if (promptedNavigation !== navigationId) {
        promptedNavigation = navigationId;
        openMatches();
    }
    return true;
}

export { mountProductReconciliation, renderCandidates };
