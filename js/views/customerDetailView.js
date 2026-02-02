import { layoutView } from "./layoutView.js";
import { customerController } from "../controllers/customerController.js";
import { DataTable } from "../components/dataTable.js";
import { createStatusBadge } from "../components/statusBadge.js";
import { createCard } from "../components/card.js";
import { LoadingSkeleton } from "../components/loadingSkeleton.js";
import { router } from "../router.js";
import { ROUTES } from "../core/constants.js";
import { formatDate, formatCurrency } from "../core/formatters.js";

export const renderCustomerDetail = async ({ id }) => {
    layoutView.render();

    const container = document.getElementById('page-container');
    container.innerHTML = LoadingSkeleton();

    // Fetch Data
    const data = await customerController.loadCustomerDetail(id);

    if (!data) {
        container.innerHTML = `<div class="p-8 text-center">Customer not found</div>`;
        return;
    }

    const { customer, orders, stats } = data;
    layoutView.updateTitle(customer.companyName || customer.name || 'Customer Detail');

    // 1. Header & KPIs
    const headerHtml = `
        <div style="display: flex; flex-direction: column; gap: 24px;">
            <!-- Top Actions -->
            <div style="display: flex; justify-content: space-between; align-items: start;">
                 <div>
                    <h1 style="font-size: 24px; font-weight: 800; color: var(--color-gray-900);">${customer.companyName || customer.name}</h1>
                    <div style="color: var(--color-gray-500); font-size: 14px; margin-top: 4px;">
                        ${customer.name !== customer.companyName ? customer.name + ' • ' : ''} ${customer.email || 'No Email'} • ${customer.phone || 'No Phone'}
                    </div>
                    <div style="margin-top: 8px;">
                        <span style="background: #f0f9ff; color: #0369a1; padding: 2px 8px; border-radius: 4px; font-weight: 700; font-size: 12px;">Category ${customer.category || '-'}</span>
                    </div>
                </div>
                <button class="btn btn-secondary" onclick="window.editCustomer('${customer.id}')">Edit Profile</button>
            </div>

            <!-- KPI Cards -->
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;">
                ${createCard({
        title: 'Total Revenue',
        content: `<div style="font-size: 24px; font-weight: 800; color: #10b981;">${formatCurrency(stats.totalRevenue)}</div>`
    })}
                 ${createCard({
        title: 'Total Orders',
        content: `<div style="font-size: 24px; font-weight: 800; color: var(--color-gray-900);">${stats.totalOrders}</div>`
    })}
                 ${createCard({
        title: 'Last Order',
        content: `<div style="font-size: 24px; font-weight: 800; color: var(--color-gray-900);">${stats.lastOrderDate ? formatDate(stats.lastOrderDate) : 'Never'}</div>`
    })}
            </div>
            
            <!-- Orders List -->
            <div class="card" style="display: flex; flex-direction: column;">
                <h3 style="padding: 16px; font-size: 16px; font-weight: 700; border-bottom: 1px solid var(--color-gray-100);">Order History</h3>
                <div id="customer-orders-table"></div>
            </div>
        </div>
    `;

    container.innerHTML = `<div class="animate-fade-in" style="width: 100%;">${headerHtml}</div>`;

    // 2. Orders Table
    const table = new DataTable({
        columns: [
            { key: 'id', label: 'Order ID', render: (val) => `<span style="color: #64748b; font-size: 12px;">#${val.slice(-6)}</span>` },
            { key: 'createdAt', label: 'Date', render: (val) => formatDate(val) },
            { key: 'status', label: 'Status', align: 'center', render: (val) => createStatusBadge(val) },
            { key: 'totalAmount', label: 'Amount', align: 'right', render: (val) => `<span style="font-weight: 700;">${formatCurrency(val)}</span>` }
        ],
        data: orders,
        onRowClick: (row) => router.navigate(ROUTES.ORDER_DETAIL.replace(':id', row.id)),
        actions: (row) => `
             <div style="display: flex; gap: 6px; justify-content: flex-end;">
                 <button class="btn-icon" onclick="event.stopPropagation(); window.printOrder('${row.id}')" title="Invoice" style="color: #6366f1; background: #eef2ff;">
                    IP
                </button>
            </div>
        `
    });

    const tableWrapper = document.getElementById('customer-orders-table');
    if (orders.length > 0) {
        tableWrapper.innerHTML = table.render();

        // Re-attach listeners for the table rows if needed, or rely on bubbling if implemented
        tableWrapper.querySelectorAll('.data-row').forEach(row => {
            row.addEventListener('click', () => {
                router.navigate(ROUTES.ORDER_DETAIL.replace(':id', row.dataset.id));
            });
        });

    } else {
        tableWrapper.innerHTML = `<div style="padding: 32px; text-align: center; color: var(--color-gray-500);">No orders found for this customer.</div>`;
    }

    // Helper for Invoice Navigation (Same as Dashboard)
    window.printOrder = async (id) => {
        try {
            const { invoiceController } = await import("../controllers/invoiceController.js");
            const invoiceId = await invoiceController.generateForOrder(id);
            if (invoiceId) {
                router.navigate(ROUTES.INVOICE_DETAIL.replace(':id', invoiceId));
            }
        } catch (e) {
            console.error("Error navigating to invoice:", e);
        }
    };

    // Import edit logic if needed, or rely on global scope if customerView loaded it (safest to re-import or use shared)
    // For now, simple edit button might just link back to main customer list or modal if we want complexity.
    // Let's bring the 'editCustomer' modal global function here too if feasible, or just keep it simple.
    // Actually, `window.editCustomer` is defined in `customerView.js` which might not be loaded if we refresh here. 
    // We should ideally extract `editCustomer` modal logic to a shared controller or utility. 
    // For this iteration, I'll dynamic import customerView to ensure window.editCustomer exists, or redefine it.

    if (!window.editCustomer) {
        // Fallback: Lazy load customerView to register the globals
        await import('./customerView.js');
    }
};
