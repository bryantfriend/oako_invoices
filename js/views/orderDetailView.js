import { layoutView } from "./layoutView.js";
import { orderDetailController } from "../controllers/orderDetailController.js";
import { createCard } from "../components/card.js";
import { createStatusBadge } from "../components/statusBadge.js";
import { LoadingSkeleton } from "../components/loadingSkeleton.js";
import { Modal } from "../components/modal.js";
import { ORDER_STATUS, ROUTES } from "../core/constants.js";
import { formatDate, formatCurrency } from "../core/formatters.js";
import { router } from "../router.js";

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

    const isEditable = order.status === ORDER_STATUS.DRAFT || order.status === ORDER_STATUS.PENDING;

    // Helper to render items table
    const renderItems = () => `
        <table style="width: 100%; border-collapse: collapse; font-size: var(--text-sm);">
            <thead style="background: var(--color-gray-50); border-bottom: 1px solid var(--color-gray-200);">
                <tr>
                    <th style="text-align: left; padding: 12px;">Item</th>
                    <th style="text-align: right; padding: 12px; width: 100px;">Price</th>
                    <th style="text-align: center; padding: 12px; width: 120px;">Requested</th>
                    <th style="text-align: center; padding: 12px; width: 120px;">Adjusted</th>
                    <th style="text-align: right; padding: 12px; width: 120px;">Total</th>
                </tr>
            </thead>
            <tbody>
                ${order.items.map((item, index) => {
        const requested = item.quantity; // Original requested
        const adjusted = item.adjustedQuantity !== undefined ? item.adjustedQuantity : item.quantity;
        const finalQty = adjusted;
        const total = finalQty * item.price;

        return `
                        <tr style="border-bottom: 1px solid var(--color-gray-100);">
                            <td style="padding: 12px;">${item.name}</td>
                            <td style="padding: 12px; text-align: right;">${formatCurrency(item.price)}</td>
                            <td style="padding: 12px; text-align: center; color: var(--color-gray-500);">${requested}</td>
                            <td style="padding: 12px; text-align: center;">
                                ${isEditable ? `
                                    <input type="number" 
                                        class="adjust-qty-input" 
                                        data-index="${index}" 
                                        value="${finalQty}" 
                                        min="0" 
                                        style="width: 80px; text-align: center; border-color: var(--color-primary-300);"
                                    >
                                ` : `<strong>${finalQty}</strong>`}
                            </td>
                            <td style="padding: 12px; text-align: right; font-weight: 500;">
                                ${formatCurrency(total)}
                            </td>
                        </tr>
                    `;
    }).join('')}
            </tbody>
            <tfoot>
                 <tr>
                    <td colspan="4" style="padding: 12px; text-align: right; font-weight: 600;">Total Amount:</td>
                    <td style="padding: 12px; text-align: right; font-weight: 700; font-size: var(--text-lg);">
                        ${formatCurrency(order.items.reduce((s, i) => s + ((i.adjustedQuantity ?? i.quantity) * i.price), 0))}
                    </td>
                </tr>
            </tfoot>
        </table>
        ${isEditable ? `
            <div style="margin-top: var(--space-4); text-align: right;">
                <button id="save-quantities" class="btn btn-secondary btn-sm" disabled>Save Adjusted Quantities</button>
            </div>
        ` : ''}
    `;

    container.innerHTML = `
        <div class="animate-fade-in" style="display: grid; grid-template-columns: 2fr 1fr; gap: var(--space-6); align-items: start;">
            <!-- Left Column: Items -->
            <div style="display: flex; flex-direction: column; gap: var(--space-6);">
                ${createCard({
        title: 'Order Items',
        content: renderItems()
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
                                ${createStatusBadge(order.status)}
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
                                        ${['fulfilled', 'paid'].includes(order.status) ? '🔒' : '🔓'}
                                    </div>
                                    <select id="manual-status-selector" class="input" style="flex: 1; font-size: 13px; height: 32px; padding: 0 8px; ${['fulfilled', 'paid'].includes(order.status) ? 'pointer-events: none; opacity: 0.6;' : ''}">
                                        ${Object.entries(ORDER_STATUS).map(([key, val]) => `
                                            <option value="${val}" ${order.status === val ? 'selected' : ''}>${val.charAt(0).toUpperCase() + val.slice(1)}</option>
                                        `).join('')}
                                    </select>
                                    <button id="apply-manual-status" class="btn btn-secondary btn-sm" style="height: 32px; display: ${['fulfilled', 'paid'].includes(order.status) ? 'none' : 'block'};">Apply</button>
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

    // Bind Quantity Adjustments
    const saveBtn = document.getElementById('save-quantities');
    if (saveBtn) {
        document.querySelectorAll('.adjust-qty-input').forEach(input => {
            input.addEventListener('input', () => {
                saveBtn.disabled = false;
                saveBtn.textContent = "Save Changes";
                saveBtn.classList.remove('btn-secondary');
                saveBtn.classList.add('btn-primary');
            });
        });

        saveBtn.addEventListener('click', async () => {
            const newItems = [...order.items];
            document.querySelectorAll('.adjust-qty-input').forEach(input => {
                const idx = parseInt(input.dataset.index);
                newItems[idx].adjustedQuantity = parseInt(input.value) || 0;
            });

            const success = await orderDetailController.updateQuantities(id, newItems);
            if (success) {
                renderOrderDetail({ id }); // Re-render
            }
        });
    }

    // Bind Status Actions
    const actionBtns = container.querySelectorAll('.status-action-btn');
    actionBtns.forEach(btn => {
        btn.addEventListener('click', async () => {
            const action = btn.dataset.action;
            const newStatus = btn.dataset.status;

            if (action === 'invoice') {
                const { invoiceService } = await import("../services/invoiceService.js");
                const invoiceId = await invoiceService.createInvoice(id);
                router.navigate(ROUTES.INVOICE_DETAIL.replace(':id', invoiceId));
                return;
            }

            if (action === 'paid') {
                const { orderService } = await import("../services/orderService.js");
                const { notificationService } = await import("../core/notificationService.js");
                await orderService.updateOrderStatus(id, ORDER_STATUS.PAID);
                notificationService.success("Order marked as Paid");
                renderOrderDetail({ id });
                return;
            }

            const { settingsService } = await import("../services/settingsService.js");
            const settings = await settingsService.getInvoiceSettings();

            const modal = new Modal({
                title: 'Confirm Order & Generate Invoice',
                content: `
                    <div style="display: flex; flex-direction: column; gap: var(--space-4);">
                        <p>Are you sure you want to confirm this order? This will generate the official invoice.</p>
                        
                        <div style="background: var(--color-gray-50); padding: var(--space-4); border-radius: var(--radius-md); border: 1px solid var(--color-gray-200);">
                            <h4 style="margin-bottom: var(--space-3); color: var(--color-gray-700);">Financial Adjustments</h4>
                            
                            <!-- Tax Section -->
                            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-2);">
                                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                    <input type="checkbox" id="modal-add-tax" checked> 
                                    <span>Add VAT (Tax)</span>
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
                                    <span>Apply Discount</span>
                                </label>
                                
                                <div id="discount-container" style="display: none; gap: var(--space-2); align-items: center;">
                                    <select id="modal-discount-type" class="input" style="width: auto;">
                                        <option value="percent">Percent (%)</option>
                                        <option value="fixed">Fixed Amount</option>
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
                confirmText: 'Confirm & Generate Invoice',
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
                        const invoiceId = await invoiceService.createInvoice(id, adjustments);
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
                if (confirm("Allow manual status change for this completed order?")) {
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
            if (newStatus === order.status) return;

            if (confirm(`Change status to ${newStatus}?`)) {
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
