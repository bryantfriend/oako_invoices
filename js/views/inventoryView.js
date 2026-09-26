import { createViewRequestGuard } from '../core/viewRequestGuard.js';
import { parseProductionQuantity } from '../core/inventoryValidation.js';
import { notificationService } from '../core/notificationService.js';
var beginInventoryRequest = createViewRequestGuard();

function showInventoryFailure(error) {
    notificationService.error(error.message || 'Inventory could not be saved. Your entries have been kept.');
}

function describeInventoryResult(result, categories) {
    if (result.ok) return;
    var names = {};
    categories.forEach(function nameCategory(category) {
        category.products.forEach(function nameProduct(product) { names[product.id] = product.displayName || product.name || product.id; });
    });
    throw new Error(result.failed.map(function describeFailure(failure) { return names[failure.productId] + ': ' + failure.error; }).join(' '));
}

import { startOvenLoading, withOvenLoading } from '../components/ovenLoading.js';
import { layoutView } from "./layoutView.js";
import { inventoryController } from "../controllers/inventoryController.js";
import { createCard } from "../components/card.js";
import { LoadingSkeleton } from "../components/loadingSkeleton.js";
import { Modal } from "../components/modal.js";
import { t } from "../core/i18n.js";
import { getLocalDateKey } from "../core/dailyOrders.js";
import { mountProductReconciliation } from "../components/productReconciliationModal.js";

export async function renderInventory(options) {
    layoutView.render();
    layoutView.updateTitle(t('inventory_title'));
    var container = document.getElementById('page-container');
    var isCurrent = beginInventoryRequest(container);
    var hadTable = Boolean(container.querySelector('.inventory-category-group'));
    if (!hadTable) container.innerHTML = LoadingSkeleton();
    var loading = startOvenLoading('Loading inventory');
    try {
        var today = getLocalDateKey(new Date());
        var data = await inventoryController.loadInventoryData(today, options);
        if (!isCurrent()) return;
        container.dataset.inventoryView = 'true';
        if (!data.length) {
            container.innerHTML = '<p>No inventory categories with products are enabled. <a href="#/settings">Open Settings</a></p>';
            return;
        }
        renderMainView(container, today, data, isCurrent);
        var needsMatches = mountProductReconciliation(container, function reloadAfterReconciliation() {
            if (isCurrent()) return renderInventory();
        }, 'inventory');
        if (data.confirmedEmpty && !needsMatches) showInitializationModal(today, data, isCurrent);
    } catch (error) {
        loading.fail();
        if (!isCurrent()) return;
        if (!hadTable) container.innerHTML = '<div role="alert">Inventory is unavailable. Reconnect and retry. <button id="retry-inventory" class="btn btn-secondary">Retry</button></div>';
        else container.insertAdjacentHTML('afterbegin', '<p role="alert">Refresh failed. Previously loaded inventory is still shown.</p>');
        var retry = container.querySelector('#retry-inventory');
        if (retry) retry.addEventListener('click', function retryInventory() { if (isCurrent()) return renderInventory({ forceRefresh: true }); });
        showInventoryFailure(error);
    } finally { loading.finish(); }
}

function renderMainView(container, date, categories, isCurrent) {
    const usesBreadDefault = categories.some(function(category) {
        return category && category.inventoryUsesBreadDefault === true;
    });
    container.innerHTML = `
        <div class="animate-fade-in" style="display: flex; flex-direction: column; gap: var(--space-6); width: 100%;">
            ${categories.readSource !== 'server' ? '<p role="status">Cached inventory is shown. Saves and unlocks will be verified online; failed changes stay here to retry.</p>' : ''}
            ${usesBreadDefault ? '<div class="daily-data-notice" role="status"><span>🥖</span><div><strong>Showing bread inventory by default</strong><p>Select different Inventory categories in Settings whenever you want to track other products.</p></div></div>' : ''}
            <div style="display: flex; flex-wrap: wrap; gap: 12px; justify-content: space-between; align-items: center;">
                <div style="display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-4);">
                    <div style="font-size: 14px; color: var(--color-gray-500);">
                        Showing inventory for <strong>${date}</strong>
                        <div style="margin-top: 4px; font-size: 12px;">Saved orders reserve stock for this day. Left = Total Baked − Ordered + Returned.</div>
                        <div style="margin-top: 4px; font-size: 12px;">Unlock to edit today’s baked totals. Each quantity saves when you leave its field. <a href="#/settings">Change inventory categories</a></div>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button id="inventory-defaults-btn" class="btn btn-secondary btn-sm">Daily starting quantities</button>
                        <button id="lock-all-btn" class="btn btn-secondary btn-sm" style="font-size: 11px; padding: 4px 10px;">🔒 Lock All</button>
                        <button id="unlock-all-btn" class="btn btn-ghost btn-sm" style="font-size: 11px; padding: 4px 10px; color: var(--color-gray-500);">🔓 Unlock &amp; edit quantities</button>
                    </div>
                </div>
                <button id="refresh-inventory" class="btn btn-ghost btn-sm">🔄 Refresh Data</button>
            </div>

            ${categories.map(function renderCategory(cat) { return `
                <div class="inventory-category-group">
                    <h3 style="font-size: 14px; font-weight: 700; color: var(--color-primary-700); margin-bottom: 12px; padding-left: 4px; border-left: 4px solid var(--color-primary-500);">
                        ${cat.name.toUpperCase()}
                    </h3>
                    ${createCard({
        padding: '0',
        content: `
                            <div style="overflow-x: auto; -webkit-overflow-scrolling: touch;">
                                <table style="width: 100%; border-collapse: collapse; font-size: 13px; min-width: 500px;">
                                    <thead style="background: var(--color-gray-50); border-bottom: 1px solid var(--color-gray-200);">
                                        <tr>
                                            <th style="text-align: left; padding: 12px 16px;">${t('table_item')}</th>
                                            <th style="text-align: center; padding: 12px 16px; width: 80px;">Ordered</th>
                                            <th style="text-align: center; padding: 12px 16px; width: 120px;">Total Baked</th>
                                            <th style="text-align: center; padding: 12px 16px; width: 80px;">${t('table_stock')}</th>
                                            <th style="text-align: center; padding: 12px 16px; width: 60px;">Lock</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${cat.products.map(function renderProduct(p) {
            const isOversold = p.left < 0;
            const rowStyle = isOversold ? 'background: var(--color-error-bg);' : '';
            return `
                                                <tr style="border-bottom: 1px solid var(--color-gray-100); ${rowStyle}">
                                                    <td style="padding: 12px 16px;">
                                                        <div style="display: flex; align-items: center; gap: var(--space-3);">
                                                            <div style="width: 40px; height: 40px; border-radius: 6px; overflow: hidden; background: var(--color-gray-100); flex-shrink: 0; border: 1px solid var(--color-gray-200);">
                                                                ${p.imageUrl ? `<img src="${p.imageUrl}" style="width: 100%; height: 100%; object-fit: cover;">` : '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--color-gray-400); font-size: 18px;">🥖</div>'}
                                                            </div>
                                                            <div style="display: flex; flex-direction: column; gap: 2px;">
                                                                <strong style="color: var(--color-gray-900); white-space: nowrap;">${p.displayName || p.name}</strong>
                                                                <span class="inventory-oversold" ${isOversold ? '' : 'hidden'} style="font-size: 11px; color: var(--color-error); font-weight: 600;">⚠️ Oversold</span>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td style="text-align: center; padding: 12px 16px;">
                                                        <span style="font-weight: 600; color: var(--color-gray-900);">${p.ordered}</span>
                                                    </td>
                                                    <td style="text-align: center; padding: 12px 16px;">
                                                        <input type="number" min="0" step="any"
                                                            class="baked-input"
                                                            data-id="${p.id}"
                                                            value="${p.totalBaked}"
                                                            ${p.locked ? 'disabled' : ''}
                                                            style="width: 70px; text-align: center; padding: 4px; border: 1px solid ${p.locked ? 'transparent' : 'var(--color-gray-200)'}; border-radius: 4px; background: ${p.locked ? 'transparent' : 'white'}; font-weight: ${p.locked ? '700' : '400'};"
                                                        >
                                                    </td>
                                                    <td style="text-align: center; padding: 12px 16px;">
                                                        <span class="inventory-left" style="font-weight: 700; color: ${isOversold ? 'var(--color-error)' : 'var(--color-success)'};">
                                                            ${p.left}
                                                        </span>
                                                    </td>
                                                    <td style="text-align: center; padding: 12px 16px;">
                                                        <button class="lock-toggle btn-icon" data-id="${p.id}" data-locked="${p.locked}">
                                                            ${p.locked ? '🔒 Unlock' : '🔓 Lock'}
                                                        </button>
                                                    </td>
                                                </tr>
                                            `;
        }).join('')}
                                    </tbody>
                                </table>
                            </div>
                        `
    })}
                </div>
            `; }).join('')}
        </div>
    `;

    var busy = false;
    function setBusy(value) {
        busy = value;
        var hasFailed = Boolean(container.querySelector('[data-save-failed="true"]'));
        container.querySelectorAll('button, input').forEach(function updateControl(control) {
            var locked = control.classList.contains('baked-input') && control.dataset.locked === 'true';
            var unlock = control.id === 'unlock-all-btn' || (control.classList.contains('lock-toggle') && control.dataset.locked === 'true');
            var blocksFailedDraft = hasFailed && control.tagName === 'BUTTON' && !control.classList.contains('retry-baked-save') && !unlock;
            // Cached data is usable: transactions check current server state before writing.
            // Never disable the unlock action needed to recover a locked failed draft.
            control.disabled = value || locked || blocksFailedDraft;
        });
    }
    function applyLockResult(result, locked) {
        result.results.forEach(function updateSuccessfulLock(record) {
            if (!record.ok) return;
            container.querySelectorAll('.lock-toggle').forEach(function matchButton(button) {
                if (button.dataset.id !== record.productId) return;
                button.dataset.locked = String(locked);
                button.textContent = locked ? '🔒 Unlock' : '🔓 Lock';
                var input = button.closest('tr').querySelector('.baked-input');
                input.dataset.locked = String(locked);
                input.style.borderColor = locked ? 'transparent' : 'var(--color-gray-200)';
                input.style.background = locked ? 'transparent' : 'white';
                input.style.fontWeight = locked ? '700' : '400';
            });
        });
    }
    async function perform(action) {
        if (busy || !isCurrent()) return;
        setBusy(true);
        try { await action(); }
        catch (error) { showInventoryFailure(error); return false; }
        finally { if (isCurrent()) setBusy(false); }
    }
    container.querySelectorAll('.baked-input').forEach(function bindQuantity(input) {
        input.dataset.locked = String(input.disabled);
        input.addEventListener('change', withOvenLoading(async function saveQuantity() {
            return perform(async function writeQuantity() {
                try {
                    var quantity = parseProductionQuantity(input.value);
                    await inventoryController.saveProduction(date, input.dataset.id, quantity);
                } catch (error) {
                    input.dataset.saveFailed = 'true';
                    input.setAttribute('aria-invalid', 'true');
                    if (!input.parentElement.querySelector('.retry-baked-save')) {
                        var retry = document.createElement('button');
                        retry.className = 'retry-baked-save btn btn-secondary btn-sm';
                        retry.textContent = 'Retry save';
                        retry.title = 'This quantity has not been saved.';
                        retry.style.color = 'var(--color-error)';
                        retry.addEventListener('click', function retrySave() { input.dispatchEvent(new Event('change')); });
                        input.parentElement.appendChild(retry);
                    }
                    throw error;
                }
                delete input.dataset.saveFailed;
                var retry = input.parentElement.querySelector('.retry-baked-save');
                if (retry) retry.remove();
                if (!isCurrent()) return;
                input.value = String(quantity);
                input.removeAttribute('aria-invalid');
                // Update only this row so another unfinished input cannot be lost.
                var product;
                categories.forEach(function findCategory(category) {
                    category.products.forEach(function findProduct(candidate) { if (candidate.id === input.dataset.id) product = candidate; });
                });
                var left = product.left + quantity - product.totalBaked;
                product.totalBaked = quantity;
                product.left = left;
                var cell = input.closest('tr').querySelector('.inventory-left');
                cell.textContent = String(left);
                input.closest('tr').querySelector('.inventory-oversold').hidden = left >= 0;
                input.closest('tr').style.background = left < 0 ? 'var(--color-error-bg)' : '';
                cell.style.color = left < 0 ? 'var(--color-error)' : 'var(--color-success)';
            });
        }, 'Saving baked quantity'));
    });
    container.querySelectorAll('.lock-toggle').forEach(function bindLock(button) {
        button.addEventListener('click', withOvenLoading(async function toggleLock() {
            return perform(async function writeLock() {
                var locked = button.dataset.locked !== 'true';
                var result = await inventoryController.setLockStatus(date, button.dataset.id, locked);
                if (isCurrent()) applyLockResult(result, locked);
                describeInventoryResult(result, categories);
            });
        }, 'Updating inventory lock'));
    });
    ['lock-all-btn', 'unlock-all-btn'].forEach(function bindBulk(id) {
        var retryCategories = null;
        container.querySelector('#' + id).addEventListener('click', withOvenLoading(async function bulkLock() {
            return perform(async function writeBulkLocks() {
                var locked = id === 'lock-all-btn';
                var result = await inventoryController.bulkUpdateLockStatus(date, retryCategories || categories, locked);
                retryCategories = [{ products: result.failed.map(function retryProduct(record) { return { id: record.productId }; }) }];
                if (result.ok) retryCategories = null;
                if (isCurrent()) applyLockResult(result, locked);
                describeInventoryResult(result, categories);
            });
        }, 'Updating inventory locks'));
    });
    container.querySelector('#inventory-defaults-btn').addEventListener('click', function editStartingQuantities() {
        if (!busy && isCurrent()) showStartingQuantitiesModal(date, categories, isCurrent);
    });
    container.querySelector('#refresh-inventory').addEventListener('click', withOvenLoading(async function refreshInventory() {
        return perform(async function refreshData() { await renderInventory({ forceRefresh: true }); });
    }, 'Refreshing inventory'));
    setBusy(false);
}

function showInitializationModal(date, categories, isCurrent) {
    const modal = new Modal({
        title: `Initialize Inventory: ${date}`,
        content: `
            <div style="display: flex; flex-direction: column; gap: 16px;">
                <p style="font-size: 14px; color: var(--color-gray-600);">
                    Today's inventory is empty. Review your saved starting quantities below, adjust them for today, or import from yesterday.
                </p>
                <div style="max-height: 400px; overflow: auto; border: 1px solid var(--color-gray-200); border-radius: 8px; -webkit-overflow-scrolling: touch;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 13px; min-width: 320px;">
                        <thead style="background: var(--color-gray-50); position: sticky; top: 0; z-index: 1;">
                            <tr>
                                <th style="text-align: left; padding: 8px 12px;">Product</th>
                                <th style="text-align: center; padding: 8px 12px; width: 100px;">Total Baked</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${categories.map(function renderCategory(cat) { return `
                                <tr style="background: #f8fafc;"><td colspan="2" style="padding: 4px 12px; font-weight: 700; font-size: 11px; color: var(--color-gray-500);">${cat.name.toUpperCase()}</td></tr>
                                ${cat.products.map(function renderProduct(p) { return `
                                    <tr style="border-bottom: 1px solid var(--color-gray-100);">
                                        <td style="padding: 8px 12px;">
                                            <div style="display: flex; align-items: center; gap: 12px;">
                                                <div style="width: 32px; height: 32px; border-radius: 4px; overflow: hidden; background: #f1f5f9; flex-shrink: 0;">
                                                    ${p.imageUrl ? `<img src="${p.imageUrl}" style="width: 100%; height: 100%; object-fit: cover;">` : '<div style="display: flex; align-items: center; justify-content: center; height: 100%; font-size: 14px;">🥖</div>'}
                                                </div>
                                                <span style="font-weight: 600; white-space: nowrap;">${p.displayName || p.name}</span>
                                            </div>
                                        </td>
                                        <td style="padding: 8px 12px; text-align: center;">
                                            <input type="number" min="0" step="any" class="init-baked-input" data-id="${p.id}" value="${getStartingQuantity(categories, p.id)}" style="width: 60px; text-align: center; border: 1px solid #ddd; border-radius: 4px; padding: 4px;">
                                        </td>
                                    </tr>
                                `; }).join('')}
                            `; }).join('')}
                        </tbody>
                    </table>
                </div>
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    <button id="confirm-init-btn" class="btn btn-primary" style="width: 100%;">Confirm & Show Table</button>
                    <button id="import-yesterday-btn" class="btn btn-secondary" style="width: 100%;">📥 Import Yesterday</button>
                </div>
            </div>
        `,
        footer: false
    });

    modal.open();
    function closeOnNavigation() { modal.close(); window.removeEventListener('hashchange', closeOnNavigation); }
    window.addEventListener('hashchange', closeOnNavigation);
    var busy = false;
    var importedEntries = null;
    var completed = new Set();
    var confirmButton = modal.modalEl.querySelector('#confirm-init-btn');
    var importButton = modal.modalEl.querySelector('#import-yesterday-btn');
    async function initialize(importing) {
        if (busy || !isCurrent()) return;
        busy = true;
        confirmButton.disabled = true;
        importButton.disabled = true;
        var inputs = Array.from(modal.modalEl.querySelectorAll('.init-baked-input'));
        try {
            var entries = inputs.filter(function pendingInput(input) { return !completed.has(input.dataset.id); }).map(function readInput(input) {
                return { productId: input.dataset.id, data: { totalBaked: parseProductionQuantity(input.value), locked: false } };
            });
            var result;
            if (importing) result = await inventoryController.importYesterday(date, importedEntries, entries.map(function getId(entry) { return entry.productId; }));
            else result = await inventoryController.initializeDay(date, entries);
            if (importing) importedEntries = result.retryEntries;
            result.results.forEach(function rememberSuccess(record) { if (record.ok) completed.add(record.productId); });
            inputs.forEach(function preserveCompleted(input) { if (completed.has(input.dataset.id)) input.disabled = true; });
            describeInventoryResult(result, categories);
            modal.close();
            window.removeEventListener('hashchange', closeOnNavigation);
            if (isCurrent()) await renderInventory();
        } catch (error) {
            showInventoryFailure(error);
            return false;
        } finally {
            busy = false;
            confirmButton.disabled = importedEntries && importedEntries.length > 0;
            importButton.disabled = completed.size > 0 && !importedEntries;
        }
    }
    importButton.addEventListener('click', withOvenLoading(async function importInventory() { return initialize(true); }, 'Importing inventory'));
    confirmButton.addEventListener('click', withOvenLoading(async function confirmInventory() { return initialize(false); }, 'Initializing inventory'));
}

function getStartingQuantity(categories, productId) {
    var defaults = categories.defaultProductionQuantities || {};
    var quantity = Number(defaults[productId]);
    if (!Number.isFinite(quantity) || quantity < 0) return 0;
    return quantity;
}

function escapeInventoryText(value) {
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showStartingQuantitiesModal(date, categories, isCurrent) {
    var products = [];
    var seen = new Set();
    categories.forEach(function collectDefaultsCategory(category) {
        category.products.forEach(function collectDefaultsProduct(product) {
            if (!seen.has(product.id)) { products.push(product); seen.add(product.id); }
        });
    });
    var modal = new Modal({
        title: 'Daily starting quantities',
        confirmText: 'Save starting quantities',
        lockWhileSubmitting: true,
        content: '<p>These quantities prefill a new day. Changing them leaves today’s saved production unchanged.</p>' +
            '<button type="button" class="btn btn-secondary btn-sm" id="defaults-use-today">Copy today’s saved totals into this form</button>' +
            '<div style="display:grid;gap:12px;margin-top:16px">' + products.map(function renderDefaultInput(product) {
                return '<label style="display:flex;justify-content:space-between;gap:16px;align-items:center">' +
                    '<span>' + escapeInventoryText(product.displayName || product.name) + '</span>' +
                    '<input class="starting-quantity-input" type="number" min="0" step="any" style="width:90px" data-id="' + escapeInventoryText(product.id) + '" value="' + getStartingQuantity(categories, product.id) + '"></label>';
            }).join('') + '</div><p class="defaults-error" role="alert" style="color:var(--color-error)"></p>',
        onConfirm: async function saveDefaults() {
            if (!isCurrent()) return false;
            var inputs = Array.from(modal.modalEl.querySelectorAll('.starting-quantity-input'));
            try {
                var entries = inputs.map(function readDefaultInput(input) {
                    return { productId: input.dataset.id, data: { totalBaked: parseProductionQuantity(input.value) } };
                }).filter(function changedDefault(entry) {
                    return entry.data.totalBaked !== getStartingQuantity(categories, entry.productId);
                });
                inputs.forEach(function disableDuringSave(input) { input.disabled = true; });
                if (entries.length) {
                    await inventoryController.saveStartingQuantities(date, entries);
                    var defaults = Object.assign({}, categories.defaultProductionQuantities || {});
                    entries.forEach(function updateLocalDefault(entry) {
                        Object.defineProperty(defaults, entry.productId, { value: entry.data.totalBaked, enumerable: true, configurable: true, writable: true });
                    });
                    categories.defaultProductionQuantities = defaults;
                }
                notificationService.success('Daily starting quantities saved.');
                return true;
            } catch (error) {
                if (modal.modalEl) modal.modalEl.querySelector('.defaults-error').textContent = error.message || 'Could not save starting quantities. Your entries are kept for retry.';
                return false;
            } finally { inputs.forEach(function enableAfterSave(input) { input.disabled = false; }); }
        }
    });
    modal.open();
    modal.modalEl.querySelector('#defaults-use-today').addEventListener('click', function copyToday() {
        if (modal.isSubmitting) return;
        modal.modalEl.querySelectorAll('.starting-quantity-input').forEach(function fillToday(input) {
            var product = products.find(function matchProduct(candidate) { return candidate.id === input.dataset.id; });
            input.value = String(product.totalBaked);
        });
    });
    window.addEventListener('hashchange', function closeDefaultsOnNavigation() {
        // The write may complete, but an old dialog must not remain over another tab.
        modal.isSubmitting = false;
        modal.close();
    }, { once: true });
}
