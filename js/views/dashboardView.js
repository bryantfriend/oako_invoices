import { dashboardController } from "../controllers/dashboardController.js";
import { layoutView } from "./layoutView.js";
import { DataTable } from "../components/dataTable.js";
import { createStatusBadge } from "../components/statusBadge.js";
import { createCard } from "../components/card.js";
import { LoadingSkeleton } from "../components/loadingSkeleton.js";
import { router } from "../router.js";
import { ROUTES } from "../core/constants.js";
import { formatDate, formatCurrency } from "../core/formatters.js";

export const renderDashboard = async () => {
    layoutView.render();
    layoutView.updateTitle("Orders Dashboard");

    const container = document.getElementById('page-container');
    container.innerHTML = LoadingSkeleton();

    // Fetch Data
    const { orders, metrics } = await dashboardController.loadDashboard();

    // Render Metrics
    const metricsHtml = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--space-4); margin-bottom: var(--space-6);">
            ${createCard({
        title: '',
        content: `
                    <div style="color: var(--color-gray-500); font-size: var(--text-sm);">Total Orders</div>
                    <div style="font-size: var(--text-3xl); font-weight: 700; color: var(--color-gray-900);">${metrics.totalOrders}</div>
                `
    })}
             ${createCard({
        title: '',
        content: `
                    <div style="color: var(--color-gray-500); font-size: var(--text-sm);">Pending Review</div>
                    <div style="font-size: var(--text-3xl); font-weight: 700; color: var(--color-warning);">${metrics.pending}</div>
                `
    })}
             ${createCard({
        title: '',
        content: `
                    <div style="color: var(--color-gray-500); font-size: var(--text-sm);">Drafts</div>
                    <div style="font-size: var(--text-3xl); font-weight: 700; color: var(--color-gray-500);">${metrics.draft}</div>
                `
    })}
        </div>
    `;

    // Render Table
    const table = new DataTable({
        columns: [
            { key: 'id', label: 'Order ID', render: (id) => `<span style="font-family: monospace;">#${id.substr(0, 8)}</span>` },
            { key: 'customerName', label: 'Customer' },
            { key: 'createdAt', label: 'Date', render: (val) => formatDate(val?.toDate ? val.toDate() : val) },
            { key: 'totalAmount', label: 'Total', render: (val) => formatCurrency(val || 0) },
            { key: 'status', label: 'Status', render: (val) => createStatusBadge(val) }
        ],
        data: orders,
        onRowClick: true,
        actions: (row) => `
            <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); window.viewOrder('${row.id}')">
                View
            </button>
        `
    });

    // Make row clickable logic
    // We need to attach event delegation or handle it in the click handler
    // Since DataTable returns string, we inject it then attach listener

    container.innerHTML = `
        <div class="animate-fade-in">
            <div style="display: flex; justify-content: flex-end; margin-bottom: var(--space-4);">
                <button id="create-order-btn" class="btn btn-primary">
                    + New Order
                </button>
            </div>
            
            ${metricsHtml}
            
            ${createCard({
        title: 'Recent Orders',
        content: table.render()
    })}
        </div>
    `;

    // Event Listeners
    document.getElementById('create-order-btn').addEventListener('click', () => {
        router.navigate(ROUTES.CREATE_ORDER);
    });

    const rows = container.querySelectorAll('.data-row');
    rows.forEach(row => {
        row.addEventListener('click', () => {
            const id = row.dataset.id;
            router.navigate(ROUTES.ORDER_DETAIL.replace(':id', id));
        });
    });

    // Global helper for the action button (as it's in a string)
    // Alternatively, we could querySelector all buttons and attach listeners
    // But for simplicity in this constraints:
    window.viewOrder = (id) => router.navigate(ROUTES.ORDER_DETAIL.replace(':id', id));
};
