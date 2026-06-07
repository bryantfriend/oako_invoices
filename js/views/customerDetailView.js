import { layoutView } from "./layoutView.js";
import { customerController } from "../controllers/customerController.js";
import { DataTable } from "../components/dataTable.js";
import { createStatusBadge } from "../components/statusBadge.js";
import { createCard } from "../components/card.js";
import { LoadingSkeleton } from "../components/loadingSkeleton.js";
import { router } from "../router.js";
import { ROUTES } from "../core/constants.js";
import { formatDate, formatCurrency } from "../core/formatters.js";
import { t } from "../core/i18n.js";

export const renderCustomerDetail = async ({ id }) => {
    layoutView.render();

    const container = document.getElementById('page-container');
    container.innerHTML = LoadingSkeleton();

    // Fetch Data
    const data = await customerController.loadCustomerDetail(id);

    if (!data) {
        container.innerHTML = `<div class="p-8 text-center">${t('customer_not_found')}</div>`;
        return;
    }

    const { customer, orders, invoices = [], returns = [], payments = [], stats, mostOrderedProducts = [] } = data;
    const latestOrder = orders[0] || null;
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
                        <span style="background: #f0fdf4; color: #166534; padding: 2px 8px; border-radius: 4px; font-weight: 800; font-size: 12px; font-family: monospace; letter-spacing: 0.08em; margin-left: 6px;">PIN ${customer.pinCode || '-'}</span>
                    </div>
                </div>
                <div style="display: flex; gap: 10px; align-items: center;">
                    ${latestOrder ? `<button class="btn btn-primary" onclick="window.repeatCustomerOrder('${latestOrder.id}')">Repeat Last Order</button>` : ''}
                    <button class="btn btn-secondary" onclick="window.editCustomer('${customer.id}')">Edit Profile</button>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px;">
                ${createCard({
        title: 'Outstanding Balance',
        content: `<div style="font-size: 24px; font-weight: 900; color: #b45309;">${formatCurrency(stats.outstandingBalance || 0)}</div>`
    })}
                ${createCard({
        title: 'Total Sales',
        content: `<div style="font-size: 24px; font-weight: 900; color: #0f766e;">${formatCurrency(stats.totalSales || stats.totalRevenue || 0)}</div>`
    })}
                ${createCard({
        title: 'Total Returns',
        content: `<div style="font-size: 24px; font-weight: 900; color: #c2410c;">${formatCurrency(stats.totalReturns || 0)}</div>`
    })}
                ${createCard({
        title: 'Payments',
        content: `<div style="font-size: 24px; font-weight: 900; color: #2563eb;">${formatCurrency(stats.totalPayments || 0)}</div>`
    })}
            </div>

            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px;">
                ${createCard({
        title: t('dash_stat_revenue'),
        content: `<div style="font-size: 24px; font-weight: 800; color: #10b981;">${formatCurrency(stats.totalRevenue)}</div>`
    })}
                 ${createCard({
        title: t('dash_stat_orders'),
        content: `<div style="font-size: 24px; font-weight: 800; color: var(--color-gray-900);">${stats.totalOrders}</div>`
    })}
                 ${createCard({
        title: t('stat_last_order'),
        content: `<div style="font-size: 24px; font-weight: 800; color: var(--color-gray-900);">${stats.lastOrderDate ? formatDate(stats.lastOrderDate) : 'Never'}</div>`
    })}
                 ${createCard({
        title: 'Top Product',
        content: `<div style="font-size: 18px; font-weight: 800; color: var(--color-gray-900);">${mostOrderedProducts[0]?.name || 'None yet'}</div>`
    })}
            </div>

            ${mostOrderedProducts.length ? `
            <div class="card" style="padding: 16px;">
                <h3 style="font-size: 16px; font-weight: 800; margin-bottom: 12px;">Most Ordered Products</h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px;">
                    ${mostOrderedProducts.map(product => `
                        <div style="border: 1px solid var(--color-gray-100); border-radius: 12px; padding: 12px; background: #fff;">
                            <div style="font-weight: 800; color: var(--color-gray-900);">${product.name}</div>
                            <div style="font-size: 12px; color: var(--color-gray-500); margin-top: 4px;">${product.quantity} total ordered across ${product.count} order${product.count === 1 ? '' : 's'}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
            ` : ''}

            <div class="card" style="display: flex; flex-direction: column;">
                <div style="padding: 16px; border-bottom: 1px solid var(--color-gray-100); display: flex; justify-content: space-between; gap: 12px; align-items: center;">
                    <h3 style="font-size: 16px; font-weight: 800; margin: 0;">Customer Statement</h3>
                    <div style="display: flex; gap: 8px; color: var(--color-gray-500); font-size: 12px; font-weight: 800;">
                        <span>${stats.invoiceCount || 0} invoices</span>
                        <span>${stats.returnCount || 0} returns</span>
                        <span>${stats.paymentCount || 0} payments</span>
                    </div>
                </div>
                <div style="display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); gap: 0; border-bottom: 1px solid var(--color-gray-100);">
                    <div style="padding: 16px; border-right: 1px solid var(--color-gray-100); min-width: 0;">
                        <h4 style="font-size: 12px; font-weight: 900; color: var(--color-gray-500); margin: 0 0 10px; text-transform: uppercase;">Invoices</h4>
                        <div id="customer-invoices-table"></div>
                    </div>
                    <div style="padding: 16px; min-width: 0;">
                        <h4 style="font-size: 12px; font-weight: 900; color: var(--color-gray-500); margin: 0 0 10px; text-transform: uppercase;">Payments</h4>
                        <div id="customer-payments-table"></div>
                    </div>
                </div>
                <div style="padding: 16px;">
                    <h4 style="font-size: 12px; font-weight: 900; color: var(--color-gray-500); margin: 0 0 10px; text-transform: uppercase;">Returns</h4>
                    <div id="customer-returns-table"></div>
                </div>
            </div>
            
            <!-- Orders List -->
            <div class="card" style="display: flex; flex-direction: column;">
                <h3 style="padding: 16px; font-size: 16px; font-weight: 700; border-bottom: 1px solid var(--color-gray-100);">${t('order_history')}</h3>
                <div id="customer-orders-table"></div>
            </div>
        </div>
    `;

    container.innerHTML = `<div class="animate-fade-in" style="width: 100%;">${headerHtml}</div>`;

    const invoicesTable = new DataTable({
        columns: [
            { key: 'invoiceNumber', label: 'Invoice', render: (val, row) => `<span style="font-weight: 800;">${val || '#' + row.id.slice(-6)}</span>` },
            { key: 'createdAt', label: 'Date', render: (val) => formatDate(val) },
            { key: 'status', label: 'Status', align: 'center', render: (val, row) => createStatusBadge(row) },
            { key: 'totalAmount', label: 'Total', align: 'right', render: (val) => `<span style="font-weight: 800;">${formatCurrency(val || 0)}</span>` }
        ],
        data: invoices,
        onRowClick: (row) => router.navigate(ROUTES.INVOICE_DETAIL.replace(':id', row.id))
    });

    const returnsTable = new DataTable({
        columns: [
            { key: 'invoiceNumber', label: 'Invoice', render: (val, row) => `<span style="font-weight: 800;">${val || '#' + row.invoiceId.slice(-6)}</span>` },
            { key: 'createdAt', label: 'Date', render: (val) => formatDate(val) },
            { key: 'itemSummary', label: 'Items', render: (val) => `<span style="font-size: 12px; color: var(--color-gray-600);">${val || '-'}</span>` },
            { key: 'totalReturnedQuantity', label: 'Qty', align: 'right', render: (val) => `<span style="font-weight: 900; color: #b45309;">${val || 0}</span>` },
            { key: 'totalReturnedAmount', label: 'Value', align: 'right', render: (val) => `<span style="font-weight: 900; color: #c2410c;">${formatCurrency(val || 0)}</span>` }
        ],
        data: returns,
        onRowClick: (row) => router.navigate(ROUTES.INVOICE_DETAIL.replace(':id', row.invoiceId))
    });

    const paymentsTable = new DataTable({
        columns: [
            { key: 'orderId', label: 'Order', render: (val) => `<span style="font-weight: 800;">#${val.slice(-6)}</span>` },
            { key: 'paidAt', label: 'Paid At', render: (val) => formatDate(val) },
            { key: 'amount', label: 'Amount', align: 'right', render: (val) => `<span style="font-weight: 900; color: #2563eb;">${formatCurrency(val || 0)}</span>` }
        ],
        data: payments,
        onRowClick: (row) => router.navigate(ROUTES.ORDER_DETAIL.replace(':id', row.orderId))
    });

    const invoicesWrapper = document.getElementById('customer-invoices-table');
    if (invoicesWrapper) {
        invoicesWrapper.innerHTML = invoices.length
            ? invoicesTable.render()
            : '<div style="padding: 18px; text-align: center; color: var(--color-gray-500); font-size: 13px; background: var(--color-gray-50); border-radius: 8px;">No invoices found.</div>';
        invoicesWrapper.querySelectorAll('.data-row').forEach(row => {
            row.addEventListener('click', () => {
                router.navigate(ROUTES.INVOICE_DETAIL.replace(':id', row.dataset.id));
            });
        });
    }

    const returnsWrapper = document.getElementById('customer-returns-table');
    if (returnsWrapper) {
        returnsWrapper.innerHTML = returns.length
            ? returnsTable.render()
            : '<div style="padding: 18px; text-align: center; color: var(--color-gray-500); font-size: 13px; background: var(--color-gray-50); border-radius: 8px;">No returns recorded.</div>';
        returnsWrapper.querySelectorAll('.data-row').forEach(row => {
            row.addEventListener('click', () => {
                const returnRow = returns.find(entry => entry.id === row.dataset.id);
                if (returnRow && returnRow.invoiceId) {
                    router.navigate(ROUTES.INVOICE_DETAIL.replace(':id', returnRow.invoiceId));
                }
            });
        });
    }

    const paymentsWrapper = document.getElementById('customer-payments-table');
    if (paymentsWrapper) {
        paymentsWrapper.innerHTML = payments.length
            ? paymentsTable.render()
            : '<div style="padding: 18px; text-align: center; color: var(--color-gray-500); font-size: 13px; background: var(--color-gray-50); border-radius: 8px;">No payments recorded.</div>';
        paymentsWrapper.querySelectorAll('.data-row').forEach(row => {
            row.addEventListener('click', () => {
                router.navigate(ROUTES.ORDER_DETAIL.replace(':id', row.dataset.id));
            });
        });
    }

    // 2. Orders Table
    const table = new DataTable({
        columns: [
            { key: 'id', label: t('table_order_id'), render: (val, row) => `<span style="color: ${row.isPrinted ? '#10b981' : '#ef4444'}; font-size: 12px;">#${val.slice(-6)}</span>` },
            { key: 'createdAt', label: t('table_date'), render: (val, row) => `<span style="color: ${row.isPrinted ? '#10b981' : '#ef4444'};">${formatDate(val)}</span>` },
            { key: 'status', label: t('table_status'), align: 'center', render: (val, row) => createStatusBadge(row) },
            { key: 'totalAmount', label: t('table_total'), align: 'right', render: (val, row) => `<span style="font-weight: 700; color: ${row.isPrinted ? '#10b981' : '#ef4444'};">${formatCurrency(val)}</span>` }
        ],
        data: orders,
        onRowClick: (row) => router.navigate(ROUTES.ORDER_DETAIL.replace(':id', row.id)),
        actions: (row) => `
             <div style="display: flex; gap: 6px; justify-content: flex-end; align-items: center;">
                 <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); window.repeatCustomerOrder('${row.id}')" title="Repeat this order">
                    Repeat
                </button>
                 <button class="btn-icon" onclick="event.stopPropagation(); window.playClickAnimation(event, 'print'); window.printOrder('${row.id}')" title="Print Invoice" style="color: ${row.isPrinted ? '#10b981' : '#ef4444'}; background: transparent; padding: 2px;">
                    🖨️
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
        tableWrapper.innerHTML = `<div style="padding: 32px; text-align: center; color: var(--color-gray-500);">${t('no_orders_found')}</div>`;
    }

    // Helper for Invoice Navigation (Same as Dashboard)
    window.printOrder = async (id) => {
        try {
            const { invoiceController } = await import("../controllers/invoiceController.js");
            const orderSnapshot = orders.find(order => order.id === id) || null;
            const invoiceId = await invoiceController.generateForOrder(id, orderSnapshot);
            if (invoiceId) {
                router.navigate(ROUTES.INVOICE_DETAIL.replace(':id', invoiceId));
            }
        } catch (e) {
            console.error("Error navigating to invoice:", e);
        }
    };

    window.repeatCustomerOrder = async (orderId) => {
        const sourceOrder = orders.find(order => order.id === orderId);
        if (!sourceOrder) return;

        const repeatDraft = {
            customerName: customer.companyName || customer.name || sourceOrder.customerName,
            notes: sourceOrder.notes ? `Repeated from ${sourceOrder.id.slice(-6)}. ${sourceOrder.notes}` : `Repeated from ${sourceOrder.id.slice(-6)}.`,
            items: (sourceOrder.items || []).map(item => ({
                productId: item.productId || '',
                name: item.name || item.productName || 'Product',
                name_en: item.name_en || item.name || item.productName || 'Product',
                name_ru: item.name_ru || '',
                name_kg: item.name_kg || '',
                price: Number(item.price) || 0,
                quantity: Number(item.adjustedQuantity !== undefined ? item.adjustedQuantity : item.quantity) || 1,
                imageUrl: item.imageUrl || '',
                weight: item.weight || ''
            })),
            sourceOrderId: sourceOrder.id,
            createdAt: new Date().toISOString()
        };

        sessionStorage.setItem('repeatOrderDraft', JSON.stringify(repeatDraft));
        router.navigate(ROUTES.CREATE_ORDER);
    };

    window.togglePrinted = async (id, isPrintedState) => {
        const { orderService } = await import("../services/orderService.js");
        await orderService.updateOrder(id, { isPrinted: isPrintedState });
        renderCustomerDetail({ id: customer.id });
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
