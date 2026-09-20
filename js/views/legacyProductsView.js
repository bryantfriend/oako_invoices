import { layoutView } from './layoutView.js';
import sessionDataStore from '../services/sessionDataStore.js';
import { productReconciliationService } from '../services/productReconciliationService.js';
import { renderCandidates } from '../components/productReconciliationModal.js';
import { findProductCategory } from '../core/productCategories.js';
import { getCurrentNavigationId, isNavigationStillCurrent } from '../core/routeGuard.js';

function escapeHtml(value) {
    return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function renderReviewEntry(entry, deleted, context) {
    var source = entry.source || {};
    var category = findProductCategory(source, context.categories);
    var categoryId = category ? category.id : '';
    var categoryControl = category
        ? '<p>Category: <strong>' + escapeHtml(category.name) + '</strong></p><input type="hidden" name="categoryId" value="' + escapeHtml(categoryId) + '">'
        : '<label>Category<select class="input" name="categoryId" data-legacy-category><option value="">Choose category</option>'
            + context.categories.map(function renderCategory(item) {
                return '<option value="' + escapeHtml(item.id) + '">' + escapeHtml(item.name) + '</option>';
            }).join('') + '</select></label>';
    var title = source.name || 'Unnamed historical product';
    return '<article class="legacy-product-row" data-review-key="' + escapeHtml(entry.key) + '">'
        + '<div class="legacy-product-heading"><div><h2>' + escapeHtml(title) + '</h2>'
        + '<p>' + escapeHtml(source.categoryName || source.categoryId || 'No historical category')
        + (source.productId ? ' · Reference: ' + escapeHtml(source.productId) : '') + '</p></div>'
        + (deleted ? '<button type="button" class="btn btn-secondary" data-review-action="restore">Restore to review</button>'
            : '<button type="button" class="btn btn-secondary legacy-delete-button" data-review-action="delete">Delete — no longer available</button>')
        + '</div>'
        + (deleted ? '<p class="legacy-product-description">No longer available. Historical orders and invoices are preserved.</p>'
            : '<details class="legacy-match-details"><summary>Match product</summary>'
                + '<form class="legacy-match-form">' + categoryControl
                + '<div class="legacy-product-candidates"></div>'
                + '<button type="submit" class="btn btn-primary" data-confirm-match disabled>Confirm product</button></form></details>')
        + '</article>';
}

async function renderLegacyProducts() {
    var navigationId = getCurrentNavigationId();
    layoutView.render();
    layoutView.updateTitle('Legacy products');
    var container = document.getElementById('page-container');
    var records = [];
    var activeTab = 'pending';
    var search = '';
    var busy = false;
    var displayedEntries = [];
    container.innerHTML = '<section class="legacy-products-page">'
        + '<div class="legacy-product-heading"><div><h1>Legacy products</h1>'
        + '<p>Review old product names whenever you have time.</p></div>'
        + '<button class="btn btn-secondary" type="button" id="legacy-review-refresh">Refresh</button></div>'
        + '<p class="legacy-product-description">Match a product that is still sold, or delete it from review if it is no longer available. '
        + 'Deleted and unreviewed products are excluded from current product totals. Past orders, invoices and monetary totals are kept.</p>'
        + '<p id="legacy-review-message" role="status" aria-live="polite"></p><p id="legacy-review-error" role="alert"></p>'
        + '<fieldset id="legacy-review-controls"><legend class="sr-only">Review legacy products</legend>'
        + '<div class="legacy-review-toolbar"><div class="legacy-review-tabs" aria-label="Review status">'
        + '<button class="btn btn-primary" type="button" data-review-tab="pending" aria-pressed="true">Awaiting review</button>'
        + '<button class="btn btn-secondary" type="button" data-review-tab="deleted" aria-pressed="false">Deleted</button></div>'
        + '<label>Search legacy products<input type="search" class="input" id="legacy-review-search" placeholder="Name, category or reference"></label></div>'
        + '<div id="legacy-review-list"><p>Loading legacy products…</p></div></fieldset></section>';
    var list = container.querySelector('#legacy-review-list');
    var controls = container.querySelector('#legacy-review-controls');
    var refresh = container.querySelector('#legacy-review-refresh');
    var message = container.querySelector('#legacy-review-message');
    var error = container.querySelector('#legacy-review-error');

    function isCurrent() {
        return isNavigationStillCurrent(navigationId, 'legacy-products');
    }

    function setBusy(value) {
        busy = value;
        controls.disabled = value;
        refresh.disabled = value;
        list.setAttribute('aria-busy', String(value));
    }

    function renderList() {
        productReconciliationService.projectRecords(records, 'legacy-products');
        var pending = productReconciliationService.getPendingMatches('legacy-products');
        var deleted = productReconciliationService.getDeletedMatches();
        var entries = activeTab === 'deleted' ? deleted : pending;
        displayedEntries = entries.filter(function matchesSearch(entry) {
            var source = entry.source || {};
            return [source.name, source.categoryName, source.categoryId, source.productId].join(' ').toLowerCase().indexOf(search) !== -1;
        }).sort(function compareEntries(left, right) {
            return String(left.source.name || '').localeCompare(String(right.source.name || ''));
        });
        container.querySelectorAll('[data-review-tab]').forEach(function updateTab(button) {
            var selected = button.dataset.reviewTab === activeTab;
            button.className = 'btn ' + (selected ? 'btn-primary' : 'btn-secondary');
            button.setAttribute('aria-pressed', String(selected));
            button.textContent = button.dataset.reviewTab === 'pending' ? 'Awaiting review (' + pending.length + ')' : 'Deleted (' + deleted.length + ')';
        });
        var context = productReconciliationService.getContext();
        list.innerHTML = displayedEntries.length ? displayedEntries.map(function renderEntry(entry) {
            return renderReviewEntry(entry, activeTab === 'deleted', context);
        }).join('') : '<p class="legacy-review-empty">' + (search ? 'No matching legacy products.' : activeTab === 'deleted' ? 'No deleted legacy products.' : 'No legacy products awaiting review.') + '</p>';
    }

    async function loadReview(forceRefresh) {
        if (busy) { return; }
        setBusy(true);
        error.textContent = '';
        try {
            var groups = await Promise.all([
                productReconciliationService.loadContext(null, null, true),
                sessionDataStore.loadOrders({ source: 'legacy-products', forceRefresh: forceRefresh })
            ]);
            if (!isCurrent()) { return; }
            var snapshot = groups[1];
            records = (snapshot.records || []).concat(snapshot.extras && snapshot.extras.returnInvoices ? snapshot.extras.returnInvoices : []);
            renderList();
        } catch (loadError) {
            if (!isCurrent()) { return; }
            error.textContent = loadError.message || 'Could not load legacy products. Use Refresh to try again.';
        } finally {
            if (isCurrent()) { setBusy(false); }
        }
    }

    async function saveReview(row, action, form) {
        if (busy || !isCurrent()) { return; }
        var entry = displayedEntries.find(function findEntry(item) { return item.key === row.dataset.reviewKey; });
        if (!entry) { return; }
        var selected = form ? form.querySelector('input[name="current-product-match"]:checked') : null;
        if (action === 'match' && !selected) { return; }
        setBusy(true);
        error.textContent = '';
        message.textContent = 'Saving review…';
        try {
            if (action === 'match') {
                await productReconciliationService.confirmMatch(entry, selected.value, form.elements.categoryId.value);
            } else {
                await productReconciliationService.setReviewState(entry, action === 'delete' ? 'unavailable' : 'pending');
            }
            if (!isCurrent()) { return; }
            message.textContent = action === 'delete' ? 'Deleted from review. You can restore it from the Deleted tab.'
                : action === 'restore' ? 'Restored to the review queue.' : 'Product match saved.';
            renderList();
        } catch (saveError) {
            if (!isCurrent()) { return; }
            message.textContent = '';
            error.textContent = saveError.message || 'Could not save this review. Please try again.';
        } finally {
            if (isCurrent()) { setBusy(false); }
        }
    }

    refresh.addEventListener('click', function refreshReview() { loadReview(true); });
    container.querySelector('#legacy-review-search').addEventListener('input', function searchReview(event) {
        search = event.target.value.trim().toLowerCase();
        renderList();
    });
    container.querySelectorAll('[data-review-tab]').forEach(function attachTab(button) {
        button.addEventListener('click', function selectTab() { activeTab = button.dataset.reviewTab; renderList(); });
    });
    list.addEventListener('click', function reviewAction(event) {
        var button = event.target.closest('[data-review-action]');
        if (button) { saveReview(button.closest('[data-review-key]'), button.dataset.reviewAction); }
    });
    list.addEventListener('change', function selectMatch(event) {
        var form = event.target.closest('.legacy-match-form');
        if (!form) { return; }
        if (event.target.hasAttribute('data-legacy-category')) {
            form.querySelector('.legacy-product-candidates').innerHTML = renderCandidates(productReconciliationService.getContext(), event.target.value);
        }
        form.querySelector('[data-confirm-match]').disabled = !form.querySelector('input[name="current-product-match"]:checked');
    });
    list.addEventListener('toggle', function openMatchingDetails(event) {
        var details = event.target;
        if (!details.matches('.legacy-match-details') || !details.open || details.dataset.candidatesReady) { return; }
        var form = details.querySelector('.legacy-match-form');
        form.querySelector('.legacy-product-candidates').innerHTML = renderCandidates(productReconciliationService.getContext(), form.elements.categoryId.value);
        details.dataset.candidatesReady = 'true';
    }, true);
    list.addEventListener('submit', function confirmProduct(event) {
        event.preventDefault();
        var form = event.target.closest('.legacy-match-form');
        if (form) { saveReview(form.closest('[data-review-key]'), 'match', form); }
    });
    await loadReview(false);
}

export { renderLegacyProducts, renderReviewEntry };
