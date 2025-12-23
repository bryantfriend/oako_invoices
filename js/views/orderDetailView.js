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
        content: `<p style="color: var(--color-gray-600); white-space: pre-wrap;">${order.notes || 'No notes provided.'}</p>`
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
        btn.addEventListener('click', () => {
            const action = btn.dataset.action;
            const newStatus = btn.dataset.status;

            if (action === 'invoice') {
                router.navigate(ROUTES.INVOICE_DETAIL.replace(':id', id)); // Generate/View Invoice logic
                return;
            }

            const modal = new Modal(
                'Update Status',
                `Are you sure you want to change status to ${newStatus}?`,
                async () => {
                    await orderDetailController.updateStatus(id, newStatus);
                    renderOrderDetail({ id });
                },
                'Confirm Change',
                newStatus === 'cancelled' ? 'destructive' : 'primary'
            );
            modal.render();
        });
    });
};

function renderStatusActions(order) {
    // State machine logic
    // Draft -> Pending -> Confirmed -> Fulfilled
    //               -> Cancelled

    const curr = order.status;
    let buttons = [];

    if (curr === ORDER_STATUS.DRAFT) {
        buttons.push({ label: 'Submit for Review', status: ORDER_STATUS.PENDING, type: 'primary' });
    }
    if (curr === ORDER_STATUS.PENDING) {
        buttons.push({ label: 'Confirm Order', status: ORDER_STATUS.CONFIRMED, type: 'primary' });
        buttons.push({ label: 'Reject / Cancel', status: ORDER_STATUS.CANCELLED, type: 'destructive' });
    }
    if (curr === ORDER_STATUS.CONFIRMED) {
        buttons.push({ label: 'Mark as Fulfilled', status: ORDER_STATUS.FULFILLED, type: 'success' });
        // Invoice Button
        buttons.push({ label: 'Generate Invoice', action: 'invoice', type: 'secondary' });
    }
    if (curr === ORDER_STATUS.FULFILLED) {
        buttons.push({ label: 'View Invoice', action: 'invoice', type: 'secondary' });
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
