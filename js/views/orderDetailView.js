import { layoutView } from "./layoutView.js";
import { orderDetailController } from "../controllers/orderDetailController.js";
import { productService } from "../services/productService.js";
import { createCard } from "../components/card.js";
import { createStatusBadge } from "../components/statusBadge.js";
import { LoadingSkeleton } from "../components/loadingSkeleton.js";
import { Modal } from "../components/modal.js";
import { t } from "../core/i18n.js";
import { ORDER_STATUS, ROUTES } from "../core/constants.js";
import { formatDate, formatCurrency } from "../core/formatters.js";
import { router } from "../router.js";
import { getDisplayStatus, getReturnState } from "../core/returnStatus.js";

function escapeHtml(value = '') {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function toPositiveInteger(value, fallback = 1) {
    const number = parseInt(value, 10);
    return Number.isFinite(number) && number > 0 ? number : fallback;
}

function getItemName(item = {}) {
    return item.name || item.productName || item.name_en || item.title || item.title_en || 'Product';
}

function makeLineItemId(productId = 'item') {
    return `line-${productId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const renderOrderDetail = async ({ id }) => {
    layoutView.render();
    layoutView.updateTitle(`Order #${id.substr(0, 8)}`);

    const container = document.getElementById('page-container');
    container.innerHTML = LoadingSkeleton();

    const order = await orderDetailController.loadOrder(id);
    if (!order) {
        container.innerHTML = `<div style="text-align: center; margin-top: 48px;">Order not found.</div>`;
        return;
    }

    const isEditable = [ORDER_STATUS.DRAFT, ORDER_STATUS.PENDING, ORDER_STATUS.CONFIRMED].includes(order.status);
    let productCatalog = null;
    let itemChangesDirty = false;
    let orderItems = (order.items || []).map((item, index) => {
        const quantity = toPositiveInteger(item.quantity, 1);
        const adjustedQuantity = toPositiveInteger(item.adjustedQuantity !== undefined ? item.adjustedQuantity : quantity, quantity);
        const price = Number(item.price) || 0;

        return {
            ...item,
            lineItemId: item.lineItemId || item.productId || `line-${index}`,
            name: getItemName(item),
            quantity,
            adjustedQuantity,
            price,
            total: price * adjustedQuantity
        };
    });

    const recalculateOrderTotal = () => orderItems.reduce((sum, item) => {
        const adjustedQuantity = toPositiveInteger(item.adjustedQuantity !== undefined ? item.adjustedQuantity : item.quantity, 1);
        return sum + ((Number(item.price) || 0) * adjustedQuantity);
    }, 0);

    const buildProductLineItem = (product, quantity) => {
        const safeQuantity = toPositiveInteger(quantity, 1);
        const productName = product.displayName || product.name || product.name_en || product.title || 'Product';
        const price = Number(product.price) || 0;

        return {
            productId: product.id,
            lineItemId: makeLineItemId(product.id),
            name: productName,
            name_en: product.name_en || product.name || productName,
            name_ru: product.name_ru || '',
            name_kg: product.name_kg || '',
            categoryId: product.categoryId || product.category_id || product.category || '',
            categoryName: product.categoryName || product.category_name || product.category || '',
            price,
            quantity: safeQuantity,
            adjustedQuantity: safeQuantity,
            total: price * safeQuantity,
            imageUrl: product.imageUrl || '',
            weight: product.weight || ''
        };
    };

    const markItemChangesDirty = () => {
        itemChangesDirty = true;
    };

    const validateOrderHasItems = () => {
        const hasItems = orderItems.some(item => toPositiveInteger(item.adjustedQuantity !== undefined ? item.adjustedQuantity : item.quantity, 0) > 0);
        if (!hasItems) {
            alert('Order must have at least one product before saving or finalizing.');
            return false;
        }
        return true;
    };

    const getOrderItemReturnedQuantity = (item = {}) => Math.max(0, Number(item.returnedQuantity || item.returnQuantity || 0) || 0);

    // Helper to render items table
    const renderItems = () => `
        <table style="width: 100%; border-collapse: collapse; font-size: var(--text-sm);">
            <thead style="background: var(--color-gray-50); border-bottom: 1px solid var(--color-gray-200);">
                <tr>
                    <th style="text-align: left; padding: 12px;">Item</th>
                    <th style="text-align: right; padding: 12px; width: 100px;">Price</th>
                    <th style="text-align: center; padding: 12px; width: 120px;">Requested</th>
                    <th style="text-align: center; padding: 12px; width: 120px;">Current Qty</th>
                    <th style="text-align: right; padding: 12px; width: 120px;">Total</th>
                </tr>
            </thead>
            <tbody>
                ${orderItems.length ? orderItems.map((item, index) => {
        const requested = item.quantity;
        const adjusted = item.adjustedQuantity !== undefined ? item.adjustedQuantity : item.quantity;
        const finalQty = toPositiveInteger(adjusted, 1);
        const price = Number(item.price) || 0;
        const total = finalQty * price;

        return `
                        <tr style="border-bottom: 1px solid var(--color-gray-100);">
                            <td style="padding: 12px;">${escapeHtml(getItemName(item))}</td>
                            <td style="padding: 12px; text-align: right;">${formatCurrency(price)}</td>
                            <td style="padding: 12px; text-align: center; color: var(--color-gray-500);">${requested}</td>
                            <td style="padding: 12px; text-align: center;">
                                <strong>${finalQty}</strong>
                                ${getOrderItemReturnedQuantity(item) > 0 ? `<div style="font-size: 11px; color: #991b1b; margin-top: 2px; font-weight: 800;">Returned: ${getOrderItemReturnedQuantity(item)}</div>` : ''}
                            </td>
                            <td class="line-total-cell" style="padding: 12px; text-align: right; font-weight: 500;">
                                ${formatCurrency(total)}
                            </td>
                        </tr>
                    `;
    }).join('') : `
                    <tr>
                        <td colspan="5" style="padding: 28px; text-align: center; color: var(--color-gray-500);">
                            No products in this order.
                        </td>
                    </tr>
                `}
            </tbody>
            <tfoot>
                 <tr>
                    <td colspan="4" style="padding: 12px; text-align: right; font-weight: 600;">Total Amount:</td>
                    <td id="order-items-total" style="padding: 12px; text-align: right; font-weight: 700; font-size: var(--text-lg);">
                        ${formatCurrency(recalculateOrderTotal())}
                    </td>
                </tr>
            </tfoot>
        </table>
    `;

    const refreshItemsEditor = () => {
        const mount = document.getElementById('order-items-editor');
        if (!mount) return;
        mount.innerHTML = renderItems();
        bindItemEditor();
    };

    container.innerHTML = `
        <div class="animate-fade-in grid-cols-mobile-1" style="display: grid; grid-template-columns: 2fr 1fr; gap: var(--space-6); align-items: start;">
            <!-- Left Column: Items -->
            <div style="display: flex; flex-direction: column; gap: var(--space-6);">
                ${createCard({
        title: 'Order Items',
        actions: isEditable ? `<button id="edit-order-items" class="btn btn-secondary btn-sm" style="font-size: 12px;">Edit Items</button>` : '',
        content: `<div id="order-items-editor">${renderItems()}</div>`
    })}
                
                ${createCard({
        title: 'Customer Notes',
        actions: `<button id="edit-notes-btn" class="btn btn-ghost btn-sm" style="font-size: 12px; color: var(--color-primary-600);">Edit</button>`,
        content: `
                        <div id="notes-view-mode">
                             <p style="color: var(--color-gray-600); white-space: pre-wrap; margin: 0;">${order.notes || 'No notes provided.'}</p>
                        </div>
                        <div id="notes-edit-mode" style="display: none; flex-direction: column; gap: var(--space-3);">
                            <textarea id="notes-textarea" class="input" rows="4" style="width: 100%; font-family: inherit; resize: vertical;">${order.notes || ''}</textarea>
                            <div style="display: flex; gap: var(--space-2); justify-content: flex-end;">
                                <button id="cancel-notes-edit" class="btn btn-secondary btn-sm">Cancel</button>
                                <button id="save-notes-btn" class="btn btn-primary btn-sm">Save Notes</button>
                            </div>
                        </div>
                    `
    })}
            </div>

            <!-- Right Column: Meta & Actions -->
            <div style="display: flex; flex-direction: column; gap: var(--space-6);">
                ${createCard({
        title: 'Order Status',
        content: `
                        <div style="display: flex; flex-direction: column; gap: var(--space-4);">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="font-size: var(--text-sm); color: var(--color-gray-500);">Current Status</span>
                                ${createStatusBadge(order)}
                            </div>
                            
                            <hr style="border: 0; border-top: 1px solid var(--color-gray-200);">
                            
                            <div style="display: flex; flex-direction: column; gap: var(--space-2);">
                                ${renderStatusActions(order)}
                            </div>

                            <hr style="border: 0; border-top: 1px solid var(--color-gray-200);">
                            
                            <div style="display: flex; flex-direction: column; gap: var(--space-2);">
                                <label style="font-size: 11px; font-weight: 700; color: var(--color-gray-400); text-transform: uppercase;">Manual Override</label>
                                <div style="display: flex; gap: var(--space-2); align-items: center;">
                                    <div id="status-lock-btn" style="cursor: pointer; font-size: 16px; padding: 4px; background: var(--color-gray-50); border-radius: 4px; display: flex; align-items: center; justify-content: center; width: 32px; height: 32px;">
                                        ${['fulfilled', 'fullfilled', 'paid'].includes(order.status) ? '🔒' : '🔓'}
                                    </div>
                                    <select id="manual-status-selector" class="input" style="flex: 1; font-size: 13px; height: 32px; padding: 0 8px; ${['fulfilled', 'fullfilled', 'paid'].includes(order.status) ? 'pointer-events: none; opacity: 0.6;' : ''}">
                                        ${Object.entries(ORDER_STATUS).filter(([key]) => key !== 'FULLY_RETURNED').map(([key, val]) => `
                                            <option value="${val}" ${(val === 'partially_returned' && getReturnState(order) === 'partial') || (val === 'returned' && getReturnState(order) === 'full') || (order.status === val && getReturnState(order) === 'none') ? 'selected' : ''}>${getDisplayStatus(val)}</option>
                                        `).join('')}
                                        ${order.status === 'fullfilled' ? '<option value="fullfilled" selected>Fulfilled</option>' : ''}
                                    </select>
                                    <button id="apply-manual-status" class="btn btn-secondary btn-sm" style="height: 32px; display: ${['fulfilled', 'fullfilled', 'paid'].includes(order.status) ? 'none' : 'block'};">Apply</button>
                                </div>
                            </div>
                        </div>
                    `
    })}

                ${createCard({
        title: 'Details',
        content: `
                        <div style="display: flex; flex-direction: column; gap: var(--space-2); font-size: var(--text-sm);">
                            <div style="display: flex; justify-content: space-between;">
                                <span style="color: var(--color-gray-500);">Customer</span>
                                <span style="font-weight: 500;">${order.customerName}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between;">
                                <span style="color: var(--color-gray-500);">Order Date</span>
                                <span style="font-weight: 600; color: var(--color-primary-600);">${order.orderDate || formatDate(order.createdAt?.toDate?.() || order.createdAt)}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between;">
                                <span style="color: var(--color-gray-500);">Created</span>
                                <span>${formatDate(order.createdAt?.toDate?.() || order.createdAt)}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between;">
                                <span style="color: var(--color-gray-500);">Created By</span>
                                <span>Admin</span>
                            </div>
                        </div>
                    `
    })}
            </div>
        </div>
    `;

    const recalculateDraftItems = items => items.map(item => {
        const adjustedQuantity = toPositiveInteger(item.adjustedQuantity !== undefined ? item.adjustedQuantity : item.quantity, 1);
        const price = Number(item.price) || 0;
        return {
            ...item,
            adjustedQuantity,
            total: price * adjustedQuantity
        };
    });

    const calculateDraftTotal = items => recalculateDraftItems(items).reduce((sum, item) => sum + (Number(item.total) || 0), 0);

    const renderOrderItemsModal = (draftItems, productSearchTerm = '') => {
        const term = productSearchTerm.trim().toLowerCase();
        const filteredProducts = (productCatalog || []).filter(product => {
            if (!term) return true;
            return [product.displayName, product.name, product.name_en, product.name_ru, product.name_kg, product.title]
                .some(value => String(value || '').toLowerCase().includes(term));
        });
        const productOptions = filteredProducts.map(product => {
            const name = product.displayName || product.name || product.name_en || product.title || 'Product';
            return `<option value="${escapeHtml(product.id)}">${escapeHtml(name)} - ${formatCurrency(Number(product.price) || 0)}</option>`;
        }).join('');

        return `
            <div style="display: grid; gap: 16px;">
                <div style="display: grid; grid-template-columns: minmax(220px, 1fr) minmax(220px, 1.4fr) 90px auto; gap: 10px; align-items: end; padding: 12px; background: var(--color-gray-50); border: 1px solid var(--color-gray-200); border-radius: 8px;">
                    <label style="display: grid; gap: 6px;">
                        <span style="font-size: 12px; font-weight: 900; color: var(--color-gray-600);">Search products</span>
                        <input id="order-edit-product-search" class="input" type="search" value="${escapeHtml(productSearchTerm)}" placeholder="Search products..." style="height: 36px;">
                    </label>
                    <label style="display: grid; gap: 6px;">
                        <span style="font-size: 12px; font-weight: 900; color: var(--color-gray-600);">Product</span>
                        <select id="order-edit-product-select" class="input" style="height: 36px;" ${filteredProducts.length ? '' : 'disabled'}>
                            ${productOptions || '<option value="">No products found</option>'}
                        </select>
                    </label>
                    <label style="display: grid; gap: 6px;">
                        <span style="font-size: 12px; font-weight: 900; color: var(--color-gray-600);">Qty</span>
                        <input id="order-edit-product-quantity" class="input" type="number" min="1" step="1" value="1" style="height: 36px; text-align: center;">
                    </label>
                    <button type="button" id="btn-order-edit-add-product" class="btn btn-primary btn-sm" style="height: 36px;">Add Product</button>
                </div>

                <div style="overflow-x: auto; border: 1px solid var(--color-gray-200); border-radius: 8px;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                        <thead style="background: var(--color-gray-50); border-bottom: 1px solid var(--color-gray-200);">
                            <tr>
                                <th style="text-align: left; padding: 10px;">Product</th>
                                <th style="text-align: right; padding: 10px; width: 120px;">Unit price</th>
                                <th style="text-align: center; padding: 10px; width: 120px;">Requested</th>
                                <th style="text-align: center; padding: 10px; width: 130px;">Current Qty</th>
                                <th style="text-align: right; padding: 10px; width: 130px;">Line total</th>
                                <th style="text-align: right; padding: 10px; width: 90px;"></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${draftItems.length ? draftItems.map((item, index) => {
                                const returnedQuantity = getOrderItemReturnedQuantity(item);
                                const minQuantity = Math.max(1, returnedQuantity);
                                const adjusted = toPositiveInteger(item.adjustedQuantity !== undefined ? item.adjustedQuantity : item.quantity, minQuantity);
                                return `
                                    <tr style="border-bottom: 1px solid var(--color-gray-100);">
                                        <td style="padding: 10px;">
                                            <div style="font-weight: 800; color: var(--color-gray-900);">${escapeHtml(getItemName(item))}</div>
                                            ${item.weight ? `<div style="font-size: 11px; color: var(--color-gray-500); margin-top: 2px;">${escapeHtml(item.weight)}</div>` : ''}
                                            ${returnedQuantity > 0 ? `<div style="font-size: 11px; color: #991b1b; margin-top: 2px; font-weight: 800;">Returned: ${returnedQuantity}</div>` : ''}
                                        </td>
                                        <td style="padding: 10px; text-align: right;">${formatCurrency(Number(item.price) || 0)}</td>
                                        <td style="padding: 10px; text-align: center; color: var(--color-gray-500);">${item.quantity || 0}</td>
                                        <td style="padding: 10px; text-align: center;">
                                            <input class="order-edit-item-qty input" type="number" min="${minQuantity}" step="1" value="${adjusted}" data-index="${index}" style="width: 88px; height: 32px; text-align: center;">
                                        </td>
                                        <td style="padding: 10px; text-align: right; font-weight: 900;">${formatCurrency((Number(item.price) || 0) * adjusted)}</td>
                                        <td style="padding: 10px; text-align: right;">
                                            <button type="button" class="btn btn-secondary btn-sm order-edit-remove-item" data-index="${index}">Remove</button>
                                        </td>
                                    </tr>
                                `;
                            }).join('') : `
                                <tr>
                                    <td colspan="6" style="padding: 18px; text-align: center; color: var(--color-gray-500);">No products in this order.</td>
                                </tr>
                            `}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td colspan="4" style="padding: 10px; text-align: right; color: var(--color-gray-500); font-weight: 800;">Total</td>
                                <td colspan="2" style="padding: 10px; text-align: right; font-weight: 900; color: var(--color-primary-700);">${formatCurrency(calculateDraftTotal(draftItems))}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        `;
    };

    const openEditOrderItemsModal = async () => {
        if (!productCatalog) {
            productCatalog = await productService.getAllProducts();
        }

        let productSearchTerm = '';
        let draftItems = recalculateDraftItems(orderItems.map(item => ({ ...item })));

        const modal = new Modal({
            title: 'Edit Order Items',
            size: 'xlarge',
            confirmText: 'Save Items',
            content: renderOrderItemsModal(draftItems, productSearchTerm),
            onConfirm: async () => {
                const normalizedDraft = recalculateDraftItems(draftItems);
                if (!normalizedDraft.length || !normalizedDraft.some(item => toPositiveInteger(item.adjustedQuantity, 0) > 0)) {
                    alert('Order must have at least one product.');
                    return false;
                }
                const success = await orderDetailController.updateOrderItems(id, normalizedDraft);
                if (success) {
                    renderOrderDetail({ id });
                }
                return success;
            }
        });

        const refreshProductOptions = () => {
            const search = document.getElementById('order-edit-product-search');
            const select = document.getElementById('order-edit-product-select');
            if (!search || !select) return;
            productSearchTerm = search.value || '';
            const term = productSearchTerm.trim().toLowerCase();
            const filteredProducts = productCatalog.filter(product => {
                if (!term) return true;
                return [product.displayName, product.name, product.name_en, product.name_ru, product.name_kg, product.title]
                    .some(value => String(value || '').toLowerCase().includes(term));
            });
            select.disabled = filteredProducts.length === 0;
            select.innerHTML = filteredProducts.length
                ? filteredProducts.map(product => `<option value="${escapeHtml(product.id)}">${escapeHtml(product.displayName || product.name || product.name_en || product.title || 'Product')} - ${formatCurrency(Number(product.price) || 0)}</option>`).join('')
                : '<option value="">No products found</option>';
        };

        const refreshModal = () => {
            const body = modal.modalEl?.querySelector('.modal-body');
            if (!body) return;
            draftItems = recalculateDraftItems(draftItems);
            body.innerHTML = renderOrderItemsModal(draftItems, productSearchTerm);
            attachModalListeners();
        };

        const attachModalListeners = () => {
            document.getElementById('order-edit-product-search')?.addEventListener('input', refreshProductOptions);

            document.getElementById('btn-order-edit-add-product')?.addEventListener('click', () => {
                const select = document.getElementById('order-edit-product-select');
                const quantityInput = document.getElementById('order-edit-product-quantity');
                const product = productCatalog.find(entry => entry.id === select?.value);
                const quantity = toPositiveInteger(quantityInput?.value, 1);
                if (!product) {
                    alert('Select a product to add.');
                    return;
                }

                const existingIndex = draftItems.findIndex(item => item.productId && item.productId === product.id);
                if (existingIndex >= 0) {
                    const currentQuantity = toPositiveInteger(draftItems[existingIndex].quantity, 1);
                    const currentAdjusted = toPositiveInteger(draftItems[existingIndex].adjustedQuantity, currentQuantity);
                    draftItems[existingIndex] = {
                        ...draftItems[existingIndex],
                        quantity: currentQuantity + quantity,
                        adjustedQuantity: currentAdjusted + quantity
                    };
                } else {
                    draftItems.push(buildProductLineItem(product, quantity));
                }
                refreshModal();
            });

            document.querySelectorAll('.order-edit-item-qty').forEach(input => {
                input.addEventListener('change', () => {
                    const idx = parseInt(input.dataset.index, 10);
                    const item = draftItems[idx];
                    if (!item) return;
                    const minQuantity = Math.max(1, getOrderItemReturnedQuantity(item));
                    const quantity = toPositiveInteger(input.value, minQuantity);
                    if (quantity < minQuantity) {
                        alert('Quantity cannot be less than the returned quantity.');
                        input.value = String(minQuantity);
                        return;
                    }
                    draftItems[idx] = {
                        ...item,
                        adjustedQuantity: quantity,
                        total: (Number(item.price) || 0) * quantity
                    };
                    refreshModal();
                });
            });

            document.querySelectorAll('.order-edit-remove-item').forEach(button => {
                button.addEventListener('click', () => {
                    const idx = parseInt(button.dataset.index, 10);
                    const item = draftItems[idx];
                    if (!item) return;
                    if (getOrderItemReturnedQuantity(item) > 0) {
                        alert('Returned items cannot be removed from the order.');
                        return;
                    }
                    if (!confirm('Remove this product from the order?')) return;
                    draftItems.splice(idx, 1);
                    refreshModal();
                });
            });
        };

        modal.open();
        attachModalListeners();
    };

    const bindItemEditor = () => {
        document.getElementById('edit-order-items')?.addEventListener('click', openEditOrderItemsModal);
    };

    bindItemEditor();

    // Bind Status Actions
    const actionBtns = container.querySelectorAll('.status-action-btn');
    actionBtns.forEach(btn => {
        btn.addEventListener('click', async () => {
            const action = btn.dataset.action;
            const newStatus = btn.dataset.status;

            if ((action === 'invoice' || newStatus === ORDER_STATUS.CONFIRMED || newStatus === ORDER_STATUS.PENDING) && itemChangesDirty) {
                alert('Save item changes before continuing.');
                return;
            }

            if (action === 'invoice' || newStatus === ORDER_STATUS.CONFIRMED || newStatus === ORDER_STATUS.PENDING) {
                if (!validateOrderHasItems()) return;
            }

            if (action === 'invoice') {
                const { invoiceService } = await import("../services/invoiceService.js");
                const invoiceId = await invoiceService.createInvoice(id, {}, order);
                router.navigate(ROUTES.INVOICE_DETAIL.replace(':id', invoiceId));
                return;
            }

            if (action === 'paid') {
                const { orderService } = await import("../services/orderService.js");
                const { notificationService } = await import("../core/notificationService.js");
                const { gamificationService } = await import("../services/gamificationService.js");
                await orderService.updateOrderStatus(id, ORDER_STATUS.PAID);
                await gamificationService.awardAction('ordersPaid');
                notificationService.success(t('msg_update_success'));
                renderOrderDetail({ id });
                return;
            }

            const { settingsService } = await import("../services/settingsService.js");
            const settings = await settingsService.getInvoiceSettings();

            const modal = new Modal({
                title: t('btn_confirm'),
                content: `
                    <div style="display: flex; flex-direction: column; gap: var(--space-4);">
                        <p>${t('modal_confirm_order_msg')}</p>
                        
                        <div style="background: var(--color-gray-50); padding: var(--space-4); border-radius: var(--radius-md); border: 1px solid var(--color-gray-200);">
                            <h4 style="margin-bottom: var(--space-3); color: var(--color-gray-700);">${t('modal_fin_adjust')}</h4>
                            
                            <!-- Tax Section -->
                            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-2);">
                                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                    <input type="checkbox" id="modal-add-tax" checked> 
                                    <span>${t('modal_add_vat')}</span>
                                </label>
                                <div id="tax-rate-container" style="display: flex; align-items: center; gap: 4px;">
                                    <input type="number" id="modal-tax-rate" value="${settings.defaultTaxRate}" step="0.5" style="width: 60px; text-align: center;" class="input">
                                    <span style="font-size: 14px; color: var(--color-gray-500);">%</span>
                                </div>
                            </div>

                            <hr style="border: 0; border-top: 1px solid var(--color-gray-200); margin: var(--space-2) 0;">

                            <!-- Discount Section -->
                            <div style="display: flex; flex-direction: column; gap: var(--space-2);">
                                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                    <input type="checkbox" id="modal-add-discount"> 
                                    <span>${t('modal_apply_discount')}</span>
                                </label>
                                
                                <div id="discount-container" style="display: none; gap: var(--space-2); align-items: center;">
                                    <select id="modal-discount-type" class="input" style="width: auto;">
                                        <option value="percent">${t('modal_discount_pct')}</option>
                                        <option value="fixed">${t('modal_discount_fixed')}</option>
                                    </select>
                                    <input type="number" id="modal-discount-value" value="0" step="1" style="width: 80px;" class="input">
                                </div>
                            </div>
                        </div>
                    </div>

                    <script>
                        // Toggle logic (since native script tags don't run in innerHTML normally, 
                        // we handle this in the view logic below the modal.open)
                    </script>
                `,
                confirmText: t('btn_confirm_gen'),
                type: newStatus === ORDER_STATUS.CANCELLED ? 'destructive' : 'primary',
                onConfirm: async () => {
                    const addTax = document.getElementById('modal-add-tax')?.checked;
                    const taxRate = parseFloat(document.getElementById('modal-tax-rate')?.value || 0);
                    const addDiscount = document.getElementById('modal-add-discount')?.checked;
                    const discountType = document.getElementById('modal-discount-type')?.value;
                    const discountValue = parseFloat(document.getElementById('modal-discount-value')?.value || 0);

                    const adjustments = {
                        taxRate: addTax ? taxRate : 0,
                        discountType: addDiscount ? discountType : 'none',
                        discountValue: addDiscount ? discountValue : 0
                    };

                    await orderDetailController.updateStatus(id, newStatus);

                    if (newStatus === ORDER_STATUS.CONFIRMED) {
                        const { invoiceService } = await import("../services/invoiceService.js");
                        const invoiceId = await invoiceService.createInvoice(id, adjustments, order);
                        router.navigate(ROUTES.INVOICE_DETAIL.replace(':id', invoiceId));
                    } else {
                        renderOrderDetail({ id });
                    }
                }
            });
            modal.open();

            // Interactivity for Modal Toggles
            const taxToggle = document.getElementById('modal-add-tax');
            const taxContainer = document.getElementById('tax-rate-container');
            taxToggle?.addEventListener('change', (e) => {
                taxContainer.style.opacity = e.target.checked ? '1' : '0.3';
                taxContainer.style.pointerEvents = e.target.checked ? 'auto' : 'none';
            });

            const discToggle = document.getElementById('modal-add-discount');
            const discContainer = document.getElementById('discount-container');
            discToggle?.addEventListener('change', (e) => {
                discContainer.style.display = e.target.checked ? 'flex' : 'none';
            });
        });
    });

    // Manual Status Override Logic
    const lockBtn = document.getElementById('status-lock-btn');
    const statusSelect = document.getElementById('manual-status-selector');
    const applyBtn = document.getElementById('apply-manual-status');

    if (lockBtn && statusSelect && applyBtn) {
        lockBtn.addEventListener('click', () => {
            const isLocked = lockBtn.textContent.trim() === '🔒';
            if (isLocked) {
                if (confirm(t('confirm_manual_status'))) {
                    lockBtn.textContent = '🔓';
                    statusSelect.style.pointerEvents = 'auto';
                    statusSelect.style.opacity = '1';
                    applyBtn.style.display = 'block';
                }
            } else {
                lockBtn.textContent = '🔒';
                statusSelect.style.pointerEvents = 'none';
                statusSelect.style.opacity = '0.6';
                applyBtn.style.display = 'none';
            }
        });

        applyBtn.addEventListener('click', async () => {
            const newStatus = statusSelect.value;
            const returnState = getReturnState(order);
            const derivedStatus = returnState === 'partial' ? 'partially_returned' : (returnState === 'full' ? 'returned' : order.status);
            if (newStatus === derivedStatus) return;

            if ((['returned', 'fully_returned'].includes(newStatus) && returnState !== 'full')
                || (['partially_returned', 'partial_return'].includes(newStatus) && returnState !== 'partial')) {
                alert('Record returned quantities on the invoice before setting a returned status.');
                statusSelect.value = derivedStatus;
                return;
            }

            if (confirm(t('confirm_change_status') + getDisplayStatus(newStatus) + '?')) {
                if ((newStatus === ORDER_STATUS.CONFIRMED || newStatus === ORDER_STATUS.PENDING) && itemChangesDirty) {
                    alert('Save item changes before continuing.');
                    return;
                }
                if (newStatus === ORDER_STATUS.CONFIRMED || newStatus === ORDER_STATUS.PENDING) {
                    if (!validateOrderHasItems()) return;
                }
                await orderDetailController.updateStatus(id, newStatus);
                renderOrderDetail({ id });
            }
        });
    }

    // Notes Editing Logic
    const editNotesBtn = document.getElementById('edit-notes-btn');
    const cancelNotesBtn = document.getElementById('cancel-notes-edit');
    const saveNotesBtn = document.getElementById('save-notes-btn');
    const viewMode = document.getElementById('notes-view-mode');
    const editMode = document.getElementById('notes-edit-mode');
    const notesTextarea = document.getElementById('notes-textarea');

    if (editNotesBtn && cancelNotesBtn && saveNotesBtn && viewMode && editMode) {
        editNotesBtn.addEventListener('click', () => {
            viewMode.style.display = 'none';
            editMode.style.display = 'flex';
            editNotesBtn.style.display = 'none';
            notesTextarea.focus();
        });

        cancelNotesBtn.addEventListener('click', () => {
            viewMode.style.display = 'block';
            editMode.style.display = 'none';
            editNotesBtn.style.display = 'block';
            notesTextarea.value = order.notes || '';
        });

        saveNotesBtn.addEventListener('click', async () => {
            const newNotes = notesTextarea.value;
            const success = await orderDetailController.updateNotes(id, newNotes);
            if (success) {
                order.notes = newNotes; // Update local copy
                renderOrderDetail({ id }); // Re-render to refresh view
            }
        });
    }
};

function renderStatusActions(order) {
    // State machine logic
    // Draft -> Pending -> Confirmed -> Fulfilled
    //               -> Cancelled

    const curr = order.status;
    let buttons = [];

    if (curr === ORDER_STATUS.DRAFT) {
        buttons.push({ label: '✨ Confirm & Generate Invoice', status: ORDER_STATUS.CONFIRMED, type: 'primary' });
        buttons.push({ label: '📤 Submit for Review', status: ORDER_STATUS.PENDING, type: 'secondary' });
    }
    if (curr === ORDER_STATUS.PENDING) {
        buttons.push({ label: '✅ Confirm & Generate Invoice', status: ORDER_STATUS.CONFIRMED, type: 'primary' });
        buttons.push({ label: '❌ Reject / Cancel', status: ORDER_STATUS.CANCELLED, type: 'destructive' });
    }
    if (curr === ORDER_STATUS.CONFIRMED) {
        buttons.push({ label: '📦 Mark as Fulfilled', status: ORDER_STATUS.FULFILLED, type: 'success' });
        buttons.push({ label: '💰 Mark as Paid', action: 'paid', type: 'primary' });
        buttons.push({ label: '📄 View/Generate Invoice', action: 'invoice', type: 'secondary' });
    }
    if (curr === ORDER_STATUS.FULFILLED) {
        buttons.push({ label: '💰 Mark as Paid', action: 'paid', type: 'primary' });
        buttons.push({ label: '📄 View Invoice', action: 'invoice', type: 'secondary' });
    }
    if (curr === ORDER_STATUS.PAID) {
        buttons.push({ label: '📄 View Invoice', action: 'invoice', type: 'secondary' });
    }

    if (curr === ORDER_STATUS.CANCELLED) {
        return `<div style="text-align: center; color: var(--color-gray-500);">Order Cancelled</div>`;
    }

    return buttons.map(b => `
        <button 
            class="status-action-btn btn btn-${b.type === 'primary' ? 'primary' : b.type === 'destructive' ? 'destructive' : 'secondary'}" 
            data-status="${b.status || ''}"
            data-action="${b.action || ''}"
            style="width: 100%; justify-content: center;"
        >
            ${b.label}
        </button>
    `).join('');
}
