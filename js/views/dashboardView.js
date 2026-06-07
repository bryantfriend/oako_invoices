import { dashboardController } from "../controllers/dashboardController.js";
import { inventoryController } from "../controllers/inventoryController.js";
import { layoutView } from "./layoutView.js";
import { DataTable } from "../components/dataTable.js";
import { createStatusBadge } from "../components/statusBadge.js";
import { createCard } from "../components/card.js";
import { LoadingSkeleton } from "../components/loadingSkeleton.js";
import { router } from "../router.js";
import { ROUTES } from "../core/constants.js";
import { formatDate, formatCurrency } from "../core/formatters.js";
import { t } from "../core/i18n.js";
import { notificationService } from "../core/notificationService.js";
import { isReturnFilterMatch } from "../core/returnStatus.js";

// Global chart registry to prevent "broken" graphs
let chartInstances = {};

const cleanupCharts = () => {
    Object.values(chartInstances).forEach(chart => {
        if (chart && typeof chart.destroy === 'function') {
            chart.destroy();
        }
    });
    chartInstances = {};
};

export const renderDashboard = async () => {
    layoutView.render();
    layoutView.updateTitle(t("sidebar_orders"));

    const container = document.getElementById('page-container');
    container.innerHTML = LoadingSkeleton();

    // Internal State
    let allOrders = [];
    let returnOrders = [];
    let returnInvoices = [];
    let filteredOrders = [];
    let inventoryCategories = [];
    let selectedOrderIds = new Set();
    let currentPeriod = '30d';
    let revenueGranularity = 'day';
    let productChartMode = 'products';
    let selectedProductCategory = null;
    let filters = { status: 'all', drill: null };
    let sort = { key: 'orderDate', order: 'desc' };
    let invoiceRefreshTimer = null;
    const pendingCheckmarkUpdates = new Set();
    const updatedCheckmarkUpdates = new Set();

    // Initial Fetch
    const today = new Date().toISOString().split('T')[0];
    const [{ orders, returnOrders: loadedReturnOrders = [], returnInvoices: loadedReturnInvoices = [] }, inventoryData] = await Promise.all([
        dashboardController.loadDashboard(),
        inventoryController.loadInventoryData(today)
    ]);
    allOrders = orders.filter(order => order.archived !== true);
    returnOrders = loadedReturnOrders;
    returnInvoices = loadedReturnInvoices;
    filteredOrders = [...allOrders];
    inventoryCategories = inventoryData;

    const getScrollPosition = () => container.scrollTop || 0;

    const restoreScrollPosition = (scrollTop) => {
        requestAnimationFrame(() => {
            container.scrollTop = scrollTop;
        });
    };

    const refreshDashboardDataPreservingState = async () => {
        const scrollTop = getScrollPosition();
        const [{ orders: refreshedOrders, returnOrders: refreshedReturnOrders = [], returnInvoices: refreshedReturnInvoices = [] }, refreshedInventoryData] = await Promise.all([
            dashboardController.loadDashboard(),
            inventoryController.loadInventoryData(today)
        ]);

        allOrders = refreshedOrders.filter(order => order.archived !== true);
        returnOrders = refreshedReturnOrders;
        returnInvoices = refreshedReturnInvoices;
        inventoryCategories = refreshedInventoryData;
        pendingCheckmarkUpdates.clear();
        updatedCheckmarkUpdates.clear();
        renderUI();
        restoreScrollPosition(scrollTop);
    };

    const scheduleInvoiceListRefresh = (delayMs = 6000) => {
        if (invoiceRefreshTimer) {
            clearTimeout(invoiceRefreshTimer);
        }

        invoiceRefreshTimer = setTimeout(async () => {
            invoiceRefreshTimer = null;

            if (pendingCheckmarkUpdates.size > 0) {
                scheduleInvoiceListRefresh(1000);
                return;
            }

            try {
                await refreshDashboardDataPreservingState();
            } catch (error) {
                notificationService.error(error.message || t('msg_load_fail'));
            }
        }, delayMs);
    };

    const updateLocalOrder = (id, updates) => {
        const applyUpdate = order => {
            if (order && order.id === id) {
                Object.assign(order, updates);
            }
        };

        allOrders.forEach(applyUpdate);
        filteredOrders.forEach(applyUpdate);
    };

    const renderPayCheckmarkButton = (row) => {
        const isPending = pendingCheckmarkUpdates.has(row.id);
        const isUpdated = updatedCheckmarkUpdates.has(row.id);
        const stateClass = isPending ? 'is-pending' : (isUpdated ? 'is-updated' : '');
        const title = isPending ? 'Updating...' : (isUpdated ? 'Updated' : 'Mark Paid');
        const disabled = isPending || isUpdated ? 'disabled' : '';

        return `
            <button
                class="btn-icon invoice-checkmark-button ${stateClass}"
                onclick="event.stopPropagation(); window.playClickAnimation(event, 'pay'); window.markAsPaid('${row.id}', event.currentTarget)"
                title="${title}"
                data-order-id="${row.id}"
                ${disabled}
            >
                ✓
            </button>
        `;
    };

    const handleSort = (key) => {
        if (sort.key === key) {
            sort.order = sort.order === 'asc' ? 'desc' : 'asc';
        } else {
            sort.key = key;
            sort.order = 'asc';
        }
        applyFilters();
    };

    window.dashboardHandleTableSort = handleSort;

    const renderUI = () => {
        cleanupCharts();
        const stats = dashboardController.loadStats(allOrders, currentPeriod, revenueGranularity, returnInvoices, returnOrders);
        const alerts = dashboardController.getRiskAlerts(allOrders);
        const productChart = getProductChartData(stats.charts);

        container.innerHTML = `
            <div class="dashboard-v2 animate-fade-in" style="display: flex; flex-direction: column; gap: 16px; padding-bottom: 40px; width: 100%;">
                
                <!-- V5 DASHBOARD GRID -->
                <div style="
                    display: flex; 
                    flex-direction: column; 
                    gap: 12px; 
                ">
                    
                    <!-- ROW 1: TOOLBAR -->
                    <div style="display: flex; justify-content: space-between; align-items: center; background: white; padding: 6px 16px; border-radius: 8px; border: 1px solid var(--color-gray-100); height: 48px;">
                        <div class="segmented-control" style="background: var(--color-gray-50); padding: 2px; border-radius: 6px; display: flex; gap: 2px;">
                            ${['today', '7d', '30d'].map(p => `
                                <button class="time-btn ${currentPeriod === p ? 'active' : ''}" data-period="${p}" style="
                                    border: none; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: 600;
                                    background: ${currentPeriod === p ? 'white' : 'transparent'};
                                    color: ${currentPeriod === p ? 'var(--color-primary-700)' : 'var(--color-gray-500)'};
                                    box-shadow: ${currentPeriod === p ? '0 1px 2px rgba(0,0,0,0.05)' : 'none'};
                                ">${p === '7d' ? '7 Days' : p === '30d' ? '30 Days' : 'Today'}</button>
                            `).join('')}
                            <div style="position: relative;">
                                <button id="btn-custom-date" class="time-btn" style="border: none; padding: 4px 10px; background: transparent; color: var(--color-gray-500); cursor: pointer; font-size: 11px; font-weight: 600;">Custom ▾</button>
                                <div id="custom-date-popover" style="display: none; position: absolute; top: 120%; left: 0; background: white; border: 1px solid #e2e8f0; border-radius: 8px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); padding: 12px; z-index: 50; min-width: 240px;">
                                    <!-- Popover content same as before -->
                                    <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                                        <input type="date" id="custom-start" style="width: 100%; font-size: 11px; padding: 4px; border: 1px solid #cbd5e1; border-radius: 4px;">
                                        <input type="date" id="custom-end" style="width: 100%; font-size: 11px; padding: 4px; border: 1px solid #cbd5e1; border-radius: 4px;">
                                    </div>
                                    <button id="apply-custom-date" style="width: 100%; background: var(--color-primary-600); color: white; border: none; padding: 6px; border-radius: 4px; font-size: 11px; font-weight: 700; cursor: pointer;">Apply</button>
                                </div>
                            </div>
                        </div>
                        <button id="create-order-btn" class="btn btn-primary" style="padding: 6px 16px; border-radius: 6px; font-weight: 700; font-size: 12px;">+ ${t('dash_new_order')}</button>
                    </div>

                    <!-- ROW 2: KPIs -->
                    ${renderInventoryStrip(inventoryCategories)}

                    <!-- ROW 2: KPIs -->
                    <div class="grid-cols-mobile-2" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; min-height: 90px;">
                        ${renderKPICard("Orders", stats.metrics.orders, false)}
                        ${renderKPICard("Revenue", stats.metrics.revenue, true)}
                        ${renderKPICard("Outstanding", stats.metrics.outstanding, true, true)}
                        ${renderKPICard("AOV", stats.metrics.aov, true)}
                    </div>

                    <!-- ROW 3: MAIN CHART (REVENUE) -->
                    <div class="card" style="padding: 12px; margin: 0; display: flex; flex-direction: column; min-height: 250px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 8px; flex-wrap: wrap;">
                            <div>
                                <h3 style="font-size: 12px; font-weight: 700; color: var(--color-gray-800); margin: 0;">Confirmed Revenue Trend</h3>
                                <div style="font-size: 10px; color: var(--color-gray-400); margin-top: 2px;">Revenue from confirmed orders, grouped by ${revenueGranularity}</div>
                            </div>
                            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                                <div class="hide-mobile" style="display: flex; gap: 12px; font-size: 10px;">
                                    <div style="display: flex; align-items: center; gap: 4px;"><span style="width: 8px; height: 8px; border-radius: 50%; background: #10b981;"></span> Confirmed Revenue</div>
                                </div>
                                <div style="background: var(--color-gray-50); padding: 2px; border-radius: 6px; display: flex; gap: 2px;">
                                    ${['day', 'week', 'month'].map(view => `
                                        <button class="revenue-view-btn" data-revenue-view="${view}" style="
                                            border: none; padding: 4px 9px; border-radius: 4px; cursor: pointer; font-size: 10px; font-weight: 700;
                                            background: ${revenueGranularity === view ? 'white' : 'transparent'};
                                            color: ${revenueGranularity === view ? 'var(--color-primary-700)' : 'var(--color-gray-500)'};
                                            box-shadow: ${revenueGranularity === view ? '0 1px 2px rgba(0,0,0,0.05)' : 'none'};
                                            text-transform: capitalize;
                                        ">${view}</button>
                                    `).join('')}
                                </div>
                            </div>
                        </div>
                        <div style="flex: 1; min-height: 0;">
                            <canvas id="chart-revenue"></canvas>
                        </div>
                    </div>

                    <!-- ROW 4: SECONDARY CHARTS (3 COL) -->
                    <div class="hide-mobile" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 12px; min-height: 180px;">
                         <!-- Units -->
                        <div class="card" style="padding: 12px; margin: 0; display: flex; flex-direction: column;">
                            <div style="margin-bottom: 6px;">
                                <h3 style="font-size: 11px; font-weight: 700; color: var(--color-gray-500); margin: 0;">ADJUSTED UNITS BY DAY</h3>
                                <div style="font-size: 10px; color: var(--color-gray-400); margin-top: 2px;">Uses final adjusted quantities, not requested quantities</div>
                            </div>
                            <div style="flex: 1; min-height: 0;">
                                <canvas id="chart-units"></canvas>
                            </div>
                        </div>
                        <!-- Pipeline -->
                        <div class="card" style="padding: 12px; margin: 0; display: flex; flex-direction: column;">
                            <div style="margin-bottom: 6px;">
                                <h3 style="font-size: 11px; font-weight: 700; color: var(--color-gray-500); margin: 0;">ORDER PIPELINE</h3>
                                <div style="font-size: 10px; color: var(--color-gray-400); margin-top: 2px;">How many orders are sitting in each stage right now</div>
                            </div>
                            <div style="flex: 1; min-height: 0;">
                                <canvas id="chart-pipeline"></canvas>
                            </div>
                        </div>
                        <!-- Products -->
                        <div class="card" style="padding: 12px; margin: 0; display: flex; flex-direction: column;">
                            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 6px;">
                                <div>
                                    <h3 style="font-size: 11px; font-weight: 700; color: var(--color-gray-500); margin: 0;">${productChart.title}</h3>
                                    <div style="font-size: 10px; color: var(--color-gray-400); margin-top: 2px;">${productChart.subtitle}</div>
                                </div>
                                <button id="toggle-product-chart-mode" class="btn btn-secondary btn-sm" style="font-size: 10px; padding: 4px 8px; white-space: nowrap;">${productChart.buttonLabel}</button>
                            </div>
                            <div style="flex: 1; min-height: 0;">
                                <canvas id="chart-products"></canvas>
                            </div>
                        </div>
                    </div>

                    ${renderReturnAnalytics(stats.charts.returnedItems)}

                    <!-- ROW 5: TABLE (FLEX GROW) -->
                    <div class="card" style="padding: 0; margin: 0; display: flex; flex-direction: column; overflow: hidden; min-height: 0;">
                        <div style="padding: 8px 12px; border-bottom: 1px solid var(--color-gray-100); display: flex; justify-content: space-between; align-items: center; background: #fff;">
                            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                                <h3 style="font-size: 12px; font-weight: 700; color: var(--color-gray-800);">${t('dash_recent_orders')}</h3>
                                <span style="background: #fee2e2; color: #b91c1c; font-size: 10px; font-weight: 800; padding: 2px 6px; border-radius: 4px;">${filteredOrders.length}</span>
                                <span id="selected-orders-count" style="display: none; background: #ecfdf5; color: #047857; font-size: 10px; font-weight: 800; padding: 2px 6px; border-radius: 4px;">0 selected</span>
                            </div>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <button id="archive-selected-orders" class="btn btn-secondary btn-sm" disabled style="font-size: 11px; padding: 4px 10px;">Archive Selected</button>
                                <select id="filter-status" style="border: 1px solid #eee; border-radius: 4px; padding: 4px 8px; font-size: 11px; font-weight: 600;">
                                    <option value="all" ${filters.status === 'all' ? 'selected' : ''}>Status: All</option>
                                    <option value="overdue" ${filters.status === 'overdue' ? 'selected' : ''}>Overdue</option>
                                    <option value="confirmed" ${filters.status === 'confirmed' ? 'selected' : ''}>Confirmed</option>
                                    <option value="any_return" ${filters.status === 'any_return' ? 'selected' : ''}>Any Return</option>
                                    <option value="partially_returned" ${filters.status === 'partially_returned' ? 'selected' : ''}>Partially Returned</option>
                                    <option value="returned" ${filters.status === 'returned' ? 'selected' : ''}>Returned</option>
                                    <option value="fulfilled" ${filters.status === 'fulfilled' ? 'selected' : ''}>Fulfilled</option>
                                    <option value="paid" ${filters.status === 'paid' ? 'selected' : ''}>Paid</option>
                                </select>
                            </div>
                        </div>
                        <div id="orders-table-wrapper" style="overflow-x: auto;"></div>
                    </div>

                </div>
            </div>
        `;

        initCharts(stats.charts, productChart);
        attachListeners();
        applyFilters();
    };

    const getProductChartData = (charts) => {
        if (selectedProductCategory) {
            const products = charts.topProductsByCategory?.[selectedProductCategory.id] || { labels: [], data: [], ids: [], fullLabels: [] };
            return {
                ...products,
                mode: 'category-products',
                title: selectedProductCategory.name.toUpperCase(),
                subtitle: 'Top products within this category. Click the button to go back.',
                buttonLabel: 'Back to Categories',
                backgroundColor: '#b45309'
            };
        }

        if (productChartMode === 'categories') {
            return {
                ...charts.topCategories,
                mode: 'categories',
                title: 'TOP CATEGORIES',
                subtitle: 'Click a category to see its best-selling products',
                buttonLabel: 'Top Products',
                backgroundColor: '#0f766e'
            };
        }

        return {
            ...charts.topProducts,
            mode: 'products',
            title: 'TOP PRODUCTS',
            subtitle: 'Best-selling items by adjusted units in this period',
            buttonLabel: 'Top Categories',
            backgroundColor: '#b45309'
        };
    };

    const renderKPICard = (label, data, isCurrency, inverted = false) => {
        const isUp = data.delta > 0;
        const color = inverted ? (isUp ? '#ef4444' : '#10b981') : (isUp ? '#10b981' : '#ef4444');
        return `
            <div class="card" style="padding: 12px; height: 100%; display: flex; flex-direction: column; justify-content: center;">
                <div style="font-size: 11px; font-weight: 700; color: var(--color-gray-500); margin-bottom: 4px;">${label}</div>
                <div style="display: flex; align-items: baseline; gap: 6px; margin-bottom: 2px;">
                    <div style="font-size: 20px; font-weight: 800; color: var(--color-gray-900);">${isCurrency ? formatCurrency(data.value) : data.value}</div>
                    <div style="font-size: 11px; font-weight: 700; color: ${color};">${isUp ? '↑' : '↓'} ${Math.abs(data.delta)}%</div>
                </div>
                <div style="font-size: 10px; color: var(--color-gray-400);">vs prior period</div>
            </div>
        `;
    };

    const renderInventoryStrip = (categories) => {
        const products = categories
            .flatMap(cat => cat.products || [])
            .sort((a, b) => (a.left ?? 0) - (b.left ?? 0));

        if (products.length === 0) {
            return '';
        }

        return `
            <div class="card" style="padding: 12px; margin: 0; display: flex; flex-direction: column; gap: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px;">
                    <div>
                        <h3 style="font-size: 12px; font-weight: 700; color: var(--color-gray-800); margin: 0;">Inventory Left Today</h3>
                        <div style="font-size: 10px; color: var(--color-gray-400); margin-top: 2px;">Live stock remaining from the Inventory tab</div>
                    </div>
                    <button id="open-inventory-btn" class="btn btn-secondary btn-sm" style="font-size: 11px;">Open Inventory</button>
                </div>

                <div style="display: flex; gap: 10px; overflow-x: auto; padding-bottom: 4px; -webkit-overflow-scrolling: touch;">
                    ${products.map(product => {
            const left = product.left ?? 0;
            const tone = left <= 0
                ? { bg: '#fef2f2', border: '#fecaca', count: '#dc2626', label: '#991b1b' }
                : left <= 5
                    ? { bg: '#fffbeb', border: '#fde68a', count: '#d97706', label: '#92400e' }
                    : { bg: '#f0fdf4', border: '#bbf7d0', count: '#16a34a', label: '#166534' };

            return `
                            <div style="
                                min-width: 180px;
                                max-width: 180px;
                                border: 1px solid ${tone.border};
                                background: ${tone.bg};
                                border-radius: 12px;
                                padding: 10px;
                                display: flex;
                                align-items: center;
                                gap: 10px;
                                flex-shrink: 0;
                            ">
                                <div style="width: 52px; height: 52px; border-radius: 10px; overflow: hidden; background: white; border: 1px solid rgba(0,0,0,0.05); flex-shrink: 0;">
                                    ${product.imageUrl
                    ? `<img src="${product.imageUrl}" alt="${product.displayName || product.name}" style="width: 100%; height: 100%; object-fit: cover;">`
                    : '<div style="display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; font-size: 22px;">🥖</div>'}
                                </div>
                                <div style="min-width: 0; display: flex; flex-direction: column; gap: 3px;">
                                    <div style="font-size: 12px; font-weight: 700; color: var(--color-gray-900); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                        ${product.displayName || product.name}
                                    </div>
                                    <div style="font-size: 10px; color: ${tone.label}; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;">
                                        ${left <= 0 ? 'Out / Oversold' : left <= 5 ? 'Low stock' : 'In stock'}
                                    </div>
                                    <div style="font-size: 18px; font-weight: 800; color: ${tone.count}; line-height: 1;">
                                        ${left}
                                    </div>
                                    <div style="font-size: 10px; color: var(--color-gray-500);">
                                        left
                                    </div>
                                </div>
                            </div>
                        `;
        }).join('')}
                </div>
            </div>
        `;
    };

    const renderBreakdownRow = (label, amount, icon, isRed = false) => `
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--color-gray-600);">
                <span>${label}</span>
            </div>
            <div style="display: flex; gap: 8px; align-items: center;">
                <span style="font-weight: 700; font-size: 13px; color: ${isRed ? '#b91c1c' : 'var(--color-gray-900)'};">${formatCurrency(amount)}</span>
                <span style="font-size: 14px; opacity: 0.5;">${icon}</span>
            </div>
        </div>
    `;

    const renderReturnAnalytics = (returns) => {
        const productRows = (returns.byProduct || []).slice(0, 6);
        const dateRows = (returns.byDate || []).slice(-6).reverse();
        const courierRows = (returns.byCourier || []).slice(0, 4);
        const sourceRows = (returns.bySource || []).slice(0, 2);

        return `
            <div class="card" style="padding: 12px; margin: 0; display: grid; grid-template-columns: minmax(220px, 0.8fr) minmax(260px, 1.2fr) minmax(260px, 1fr); gap: 12px; align-items: stretch;">
                <div style="display: flex; flex-direction: column; gap: 10px;">
                    <div>
                        <h3 style="font-size: 12px; font-weight: 800; color: var(--color-gray-800); margin: 0;">Total returned</h3>
                        <div style="font-size: 10px; color: var(--color-gray-400); margin-top: 2px;">Invoice returns and courier returns. Deleted/cancelled orders excluded.</div>
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px;">
                        <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 10px;">
                            <div style="font-size: 10px; color: #92400e; font-weight: 800; text-transform: uppercase;">Quantity</div>
                            <div style="font-size: 22px; color: #b45309; font-weight: 900; margin-top: 4px;">${returns.totalReturnedQuantity || 0}</div>
                        </div>
                        <div style="background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 10px;">
                            <div style="font-size: 10px; color: #9a3412; font-weight: 800; text-transform: uppercase;">Value</div>
                            <div style="font-size: 18px; color: #c2410c; font-weight: 900; margin-top: 6px;">${formatCurrency(returns.totalReturnedAmount || 0)}</div>
                        </div>
                        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px;">
                            <div style="font-size: 10px; color: #475569; font-weight: 800; text-transform: uppercase;">Orders</div>
                            <div style="font-size: 22px; color: #334155; font-weight: 900; margin-top: 4px;">${returns.returnedOrdersCount || 0}</div>
                        </div>
                        <div style="background: #fef3c7; border: 1px solid #fde68a; border-radius: 8px; padding: 10px;">
                            <div style="font-size: 10px; color: #92400e; font-weight: 800; text-transform: uppercase;">Partial</div>
                            <div style="font-size: 22px; color: #92400e; font-weight: 900; margin-top: 4px;">${returns.partiallyReturnedCount || 0}</div>
                        </div>
                        <div style="background: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px; padding: 10px;">
                            <div style="font-size: 10px; color: #78350f; font-weight: 800; text-transform: uppercase;">Full</div>
                            <div style="font-size: 22px; color: #78350f; font-weight: 900; margin-top: 4px;">${returns.fullyReturnedCount || 0}</div>
                        </div>
                    </div>
                    <div style="display: grid; gap: 6px;">
                        ${sourceRows.length ? sourceRows.map(row => `
                            <div style="display: grid; grid-template-columns: 1fr auto auto; gap: 8px; align-items: center; font-size: 11px; padding: 7px 8px; background: var(--color-gray-50); border-radius: 6px;">
                                <span style="font-weight: 800;">${row.label}</span>
                                <span style="font-weight: 900; color: ${row.source === 'courier' ? '#0f766e' : '#b45309'};">${row.quantity}</span>
                                <span style="font-weight: 800; color: var(--color-gray-600);">${formatCurrency(row.amount)}</span>
                            </div>
                        `).join('') : '<div style="padding: 10px; color: var(--color-gray-500); font-size: 12px; background: var(--color-gray-50); border-radius: 8px;">No invoice returns or courier returns in this period.</div>'}
                    </div>
                    <div style="flex: 1; min-height: 110px;">
                        ${(returns.byDate || []).length ? '<canvas id="chart-returns"></canvas>' : '<div style="height: 100%; display: grid; place-items: center; color: var(--color-gray-400); font-size: 12px; background: var(--color-gray-50); border-radius: 8px;">No returns found for this period.</div>'}
                    </div>
                </div>
                <div style="display: flex; flex-direction: column; min-width: 0;">
                    <h4 style="font-size: 11px; font-weight: 800; color: var(--color-gray-500); margin: 0 0 8px;">BY PRODUCT</h4>
                    <div style="display: grid; gap: 6px;">
                        ${productRows.length ? productRows.map(row => `
                            <div style="display: grid; grid-template-columns: 1fr auto auto; gap: 10px; align-items: center; font-size: 12px; padding: 8px; background: var(--color-gray-50); border-radius: 6px;">
                                <span style="font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${row.productName}</span>
                                <span style="font-weight: 900; color: #b45309;">${row.quantity}</span>
                                <span style="font-weight: 800; color: var(--color-gray-600);">${formatCurrency(row.amount)}</span>
                            </div>
                        `).join('') : '<div style="padding: 18px; color: var(--color-gray-500); font-size: 13px; background: var(--color-gray-50); border-radius: 8px;">No returned items yet.</div>'}
                    </div>
                </div>
                <div style="display: flex; flex-direction: column; min-width: 0;">
                    <h4 style="font-size: 11px; font-weight: 800; color: var(--color-gray-500); margin: 0 0 8px;">BY DATE</h4>
                    <div style="display: grid; gap: 6px; margin-bottom: 10px;">
                        ${dateRows.length ? dateRows.map(row => `
                            <div style="display: grid; grid-template-columns: 1fr auto auto; gap: 10px; align-items: center; font-size: 12px; padding: 8px; background: var(--color-gray-50); border-radius: 6px;">
                                <span style="font-weight: 800;">${row.date}</span>
                                <span style="font-weight: 900; color: #b45309;">${row.quantity}</span>
                                <span style="font-weight: 800; color: var(--color-gray-600);">${formatCurrency(row.amount)}</span>
                            </div>
                        `).join('') : '<div style="padding: 18px; color: var(--color-gray-500); font-size: 13px; background: var(--color-gray-50); border-radius: 8px;">No returns found for this period.</div>'}
                    </div>
                    <h4 style="font-size: 11px; font-weight: 800; color: var(--color-gray-500); margin: 0 0 8px;">RETURNS BY COURIER</h4>
                    <div style="display: grid; gap: 6px;">
                        ${courierRows.length ? courierRows.map(row => `
                            <div style="display: grid; grid-template-columns: 1fr auto auto; gap: 10px; align-items: center; font-size: 12px; padding: 8px; background: #f0fdfa; border-radius: 6px;">
                                <span style="font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${row.courierName}</span>
                                <span style="font-weight: 900; color: #0f766e;">${row.quantity}</span>
                                <span style="font-weight: 800; color: var(--color-gray-600);">${formatCurrency(row.amount)}</span>
                            </div>
                        `).join('') : '<div style="padding: 12px; color: var(--color-gray-500); font-size: 12px; background: var(--color-gray-50); border-radius: 8px;">No courier returns in this period.</div>'}
                    </div>
                </div>
            </div>
        `;
    };

    const initCharts = (chartData, productChart) => {
        const ctxRev = document.getElementById('chart-revenue').getContext('2d');
        const ctxUnits = document.getElementById('chart-units').getContext('2d');
        const ctxPipeline = document.getElementById('chart-pipeline').getContext('2d');
        const ctxProducts = document.getElementById('chart-products').getContext('2d');
        const ctxReturns = document.getElementById('chart-returns');

        // Revenue Chart (Line) - Compact
        chartInstances.rev = new Chart(ctxRev, {
            type: 'line',
            data: {
                labels: chartData.revenueOverTime.labels,
                datasets: [
                    {
                        label: 'Confirmed Revenue',
                        data: chartData.revenueOverTime.confirmedRevenue || chartData.revenueOverTime.gross,
                        borderColor: '#10b981',
                        backgroundColor: (ctx) => {
                            const gradient = ctx.chart.ctx.createLinearGradient(0, 0, 0, 300);
                            gradient.addColorStop(0, 'rgba(16, 185, 129, 0.1)');
                            gradient.addColorStop(1, 'rgba(16, 185, 129, 0)');
                            return gradient;
                        },
                        fill: true,
                        tension: 0.4,
                        borderWidth: 3,
                        pointRadius: 0,
                        pointHoverRadius: 5
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#1e293b',
                        padding: 6,
                        titleFont: { size: 10 },
                        bodyFont: { size: 10 },
                        cornerRadius: 4,
                        intersect: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        border: { display: false },
                        grid: { color: '#f1f5f9' },
                        ticks: { color: '#94a3b8', font: { size: 9 }, maxTicksLimit: 4, padding: 0 }
                    },
                    x: {
                        border: { display: false },
                        grid: { display: false },
                        ticks: { color: '#94a3b8', font: { size: 9 }, maxTicksLimit: 6, padding: 0 }
                    }
                },
                layout: { padding: 0 }
            }
        });

        const commonBarOptions = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            layout: { padding: 0 },
            scales: {
                y: { display: false, border: { display: false } },
                x: { display: false, border: { display: false } }
            }
        };

        // Adjusted Units Chart
        chartInstances.units = new Chart(ctxUnits, {
            type: 'bar',
            data: {
                labels: chartData.unitDemandOverTime.labels,
                datasets: [{
                    label: 'Adjusted Units',
                    data: chartData.unitDemandOverTime.data,
                    backgroundColor: '#0f766e',
                    borderRadius: 2,
                    barThickness: 'flex',
                    maxBarThickness: 16
                }]
            },
            options: {
                ...commonBarOptions,
                scales: {
                    y: {
                        beginAtZero: true,
                        border: { display: false },
                        grid: { color: '#f1f5f9' },
                        ticks: { color: '#94a3b8', font: { size: 9 }, maxTicksLimit: 4 }
                    },
                    x: {
                        border: { display: false },
                        grid: { display: false },
                        ticks: { color: '#94a3b8', font: { size: 9 }, maxTicksLimit: 6 }
                    }
                }
            }
        });

        // Pipeline Chart
        chartInstances.pipeline = new Chart(ctxPipeline, {
            type: 'bar',
            data: {
                labels: chartData.statusPipeline.labels,
                datasets: [{
                    data: chartData.statusPipeline.data,
                    backgroundColor: ['#94a3b8', '#f59e0b', '#3b82f6', '#b45309', '#8b5cf6', '#10b981'],
                    borderRadius: 3,
                    barThickness: 24
                }]
            },
            options: {
                ...commonBarOptions,
                scales: {
                    y: {
                        beginAtZero: true,
                        border: { display: false },
                        grid: { color: '#f1f5f9' },
                        ticks: { color: '#94a3b8', font: { size: 9 }, maxTicksLimit: 4 }
                    },
                    x: {
                        display: true,
                        grid: { display: false },
                        border: { display: false },
                        ticks: { font: { size: 9, weight: '700' }, color: '#64748b' }
                    }
                }
            }
        });

        // Top Products Chart
        chartInstances.products = new Chart(ctxProducts, {
            type: 'bar',
            data: {
                labels: productChart.labels,
                datasets: [{
                    data: productChart.data,
                    backgroundColor: productChart.backgroundColor,
                    borderRadius: 3,
                    barThickness: 12
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                plugins: { legend: { display: false } },
                layout: { padding: 0 },
                onHover: (event, elements) => {
                    if (event.native?.target) {
                        event.native.target.style.cursor = productChart.mode === 'categories' && elements.length ? 'pointer' : 'default';
                    }
                },
                onClick: (event, elements) => {
                    if (productChart.mode !== 'categories' || !elements.length) return;
                    const index = elements[0].index;
                    selectedProductCategory = {
                        id: productChart.ids[index],
                        name: productChart.fullLabels[index] || productChart.labels[index]
                    };
                    renderUI();
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        grid: { color: '#f1f5f9' },
                        border: { display: false },
                        ticks: { color: '#94a3b8', font: { size: 9 }, maxTicksLimit: 4 }
                    },
                    y: {
                        display: true,
                        grid: { display: false },
                        border: { display: false },
                        ticks: { font: { size: 9, weight: '600' }, color: '#475569' }
                    }
                }
            }
        });

        if (ctxReturns) {
            chartInstances.returns = new Chart(ctxReturns, {
                type: 'bar',
                data: {
                    labels: chartData.returnedItems.labels,
                    datasets: [{
                        label: 'Returned Quantity',
                        data: chartData.returnedItems.quantities,
                        backgroundColor: '#b45309',
                        borderRadius: 3,
                        barThickness: 'flex',
                        maxBarThickness: 16
                    }]
                },
                options: {
                    ...commonBarOptions,
                    scales: {
                        y: {
                            beginAtZero: true,
                            border: { display: false },
                            grid: { color: '#f1f5f9' },
                            ticks: { color: '#94a3b8', font: { size: 9 }, maxTicksLimit: 4 }
                        },
                        x: {
                            border: { display: false },
                            grid: { display: false },
                            ticks: { color: '#94a3b8', font: { size: 9 }, maxTicksLimit: 5 }
                        }
                    }
                }
            });
        }
    };

    const applyFilters = () => {
        filteredOrders = allOrders.filter(o => {
            const matchesStatus = filters.status === 'all' ? true :
                filters.status === 'overdue' ? (o.agingDays >= 1 && ['confirmed', 'fulfilled', 'fullfilled'].includes(o.status)) :
                    filters.status === 'due-today' ? (o.agingDays === 0 && ['confirmed', 'fulfilled', 'fullfilled'].includes(o.status)) :
                    ['returned', 'partially_returned', 'partial_return', 'fully_returned', 'any_return'].includes(filters.status) ? isReturnFilterMatch(o, filters.status) :
                        o.status === filters.status;

            const matchesDrill = !filters.drill ? true :
                filters.drill.type === 'aging' ? (
                    filters.drill.value === 2 ? o.agingDays >= 30 :
                        filters.drill.value === 1 ? (o.agingDays >= 1 && o.agingDays < 30) :
                            (o.agingDays === 0 && ['confirmed', 'fulfilled', 'fullfilled'].includes(o.status))
                ) : true;

            return matchesStatus && matchesDrill;
        });

        // Apply Sorting
        filteredOrders.sort((a, b) => {
            if (a.isPrinted !== b.isPrinted) {
                return a.isPrinted ? 1 : -1;
            }

            let valA = a[sort.key];
            let valB = b[sort.key];

            // Handle special cases (dates, nested objects)
            if (sort.key === 'orderDate') {
                valA = valA?.toDate ? valA.toDate() : new Date(valA);
                valB = valB?.toDate ? valB.toDate() : new Date(valB);
            }

            if (valA < valB) return sort.order === 'asc' ? -1 : 1;
            if (valA > valB) return sort.order === 'asc' ? 1 : -1;
            return 0;
        });

        refreshTable();
    };

    const refreshTable = () => {
        const table = new DataTable({
            columns: [
                {
                    key: 'select',
                    label: `<input type="checkbox" id="select-all-orders" title="Select visible orders" style="cursor: pointer;">`,
                    sortable: false,
                    align: 'center',
                    render: (val, row) => `
                        <input 
                            type="checkbox" 
                            class="order-select-checkbox" 
                            data-id="${row.id}" 
                            ${selectedOrderIds.has(row.id) ? 'checked' : ''}
                            onclick="event.stopPropagation();"
                            style="cursor: pointer;"
                        >
                    `
                },
                {
                    key: 'status', label: 'Cat', align: 'center', render: (val, row) => {
                        const cat = (row.customerCategory || 'C');
                        const catColor = row.isPrinted ? '#10b981' : '#ef4444';
                        const catBg = row.isPrinted ? '#d1fae5' : '#fee2e2';
                        return `<div style="width: 24px; height: 24px; border-radius: 4px; background: ${catBg}; color: ${catColor}; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 11px;">${cat}</div>`;
                    }
                },
                { key: 'id', label: t('table_order_id'), render: (val, row) => `<span style="color: ${row.isPrinted ? '#10b981' : '#ef4444'}; font-size: 11px;">#${val.slice(-6)}</span>` },
                {
                    key: 'customerName', label: t('table_customer'), render: (val, row) => `
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                        <span style="font-weight: 700; color: ${row.isPrinted ? '#10b981' : '#ef4444'};">${val}</span>
                        <div style="display: flex; gap: 4px; align-items: center;">
                            <button class="btn-icon" onclick="event.stopPropagation(); window.playClickAnimation(event, 'print'); window.printOrder('${row.id}')" title="Print Invoice" style="color: ${row.isPrinted ? '#10b981' : '#ef4444'}; background: transparent; padding: 2px;">
                                🖨️
                            </button>
                        </div>
                    </div>
                ` },
                { key: 'orderDate', label: t('table_date'), render: (val, row) => `<span style="color: ${row.isPrinted ? '#10b981' : '#ef4444'};">${formatDate(val)}</span>` },
                { key: 'totalAmount', label: t('table_total'), align: 'right', render: (val, row) => `<span style="font-weight: 700; color: ${row.isPrinted ? '#10b981' : '#ef4444'};">${formatCurrency(val)}</span>` },
                {
                    key: 'agingDays',
                    label: 'Due',
                    align: 'right',
                    render: (val, row) => {
                        const textColor = row.isPrinted ? '#10b981' : '#ef4444';
                        if (row.status === 'paid' || row.status === 'draft') return `<span style="color: ${textColor};">-</span>`;
                        if (val === 0) return `<span style="color: ${textColor}; font-weight: 700; font-size: 11px;">TODAY</span>`;
                        return `<span style="font-weight: 800; color: ${textColor};">${val}d Overdue</span>`;
                    }
                },
                { key: 'status', label: t('table_status'), align: 'center', render: (val, row) => createStatusBadge(row) }
            ],
            data: filteredOrders,
            sortKey: sort.key,
            sortOrder: sort.order,
            sortHandlerName: 'dashboardHandleTableSort',
            onRowClick: (row) => router.navigate(ROUTES.ORDER_DETAIL.replace(':id', row.id)),
            actions: (row) => `
                <div style="display: flex; gap: 6px; justify-content: flex-end; align-items: center;">
                    ${row.status === 'confirmed' ? `
                        <button class="btn-icon" onclick="event.stopPropagation(); window.playClickAnimation(event, 'fulfill'); window.markAsFulfilled('${row.id}')" title="Mark Fulfilled" style="color: #6366f1; background: #eef2ff;">
                            📦
                        </button>
                    ` : ''}
                    ${['confirmed', 'fulfilled', 'fullfilled'].includes(row.status) || pendingCheckmarkUpdates.has(row.id) || updatedCheckmarkUpdates.has(row.id) ? renderPayCheckmarkButton(row) : ''}
                     <button class="btn-icon" onclick="event.stopPropagation(); window.viewOrder('${row.id}')" title="View">
                         <span style="opacity: 0.5; font-size: 12px;">👁️</span>
                    </button>
                    ${row.status === 'draft' ? `<button class="btn-icon" onclick="event.stopPropagation(); window.playClickAnimation(event, 'delete'); window.deleteOrder('${row.id}')"><span style="opacity: 0.5;">🗑️</span></button>` : ''}
                </div>
            `
        });

        const wrapper = document.getElementById('orders-table-wrapper');
        if (!wrapper) return;
        wrapper.innerHTML = table.render();

        const visibleIds = new Set(filteredOrders.map(order => order.id));
        selectedOrderIds = new Set([...selectedOrderIds].filter(id => visibleIds.has(id)));

        wrapper.querySelectorAll('.order-select-checkbox').forEach(checkbox => {
            checkbox.addEventListener('click', e => {
                e.stopPropagation();
                scheduleInvoiceListRefresh(6000);
            });
            checkbox.addEventListener('change', e => {
                scheduleInvoiceListRefresh(6000);
                const id = e.target.dataset.id;
                if (e.target.checked) {
                    selectedOrderIds.add(id);
                } else {
                    selectedOrderIds.delete(id);
                }
                updateBulkArchiveControls();
            });
        });

        const selectAll = wrapper.querySelector('#select-all-orders');
        if (selectAll) {
            selectAll.checked = filteredOrders.length > 0 && filteredOrders.every(order => selectedOrderIds.has(order.id));
            selectAll.indeterminate = selectedOrderIds.size > 0 && !selectAll.checked;
            selectAll.addEventListener('click', e => {
                e.stopPropagation();
                scheduleInvoiceListRefresh(6000);
            });
            selectAll.addEventListener('change', e => {
                scheduleInvoiceListRefresh(6000);
                filteredOrders.forEach(order => {
                    if (e.target.checked) {
                        selectedOrderIds.add(order.id);
                    } else {
                        selectedOrderIds.delete(order.id);
                    }
                });
                refreshTable();
            });
        }

        wrapper.querySelectorAll('.data-row').forEach(row => {
            row.addEventListener('click', () => {
                router.navigate(ROUTES.ORDER_DETAIL.replace(':id', row.dataset.id));
            });
        });

        updateBulkArchiveControls();
    };

    const updateBulkArchiveControls = () => {
        const count = selectedOrderIds.size;
        const countEl = document.getElementById('selected-orders-count');
        const archiveBtn = document.getElementById('archive-selected-orders');

        if (countEl) {
            countEl.style.display = count > 0 ? 'inline-flex' : 'none';
            countEl.textContent = `${count} selected`;
        }

        if (archiveBtn) {
            archiveBtn.disabled = count === 0;
            archiveBtn.textContent = count > 0 ? `Archive ${count} Selected` : 'Archive Selected';
        }
    };

    const attachListeners = () => {
        document.querySelectorAll('.time-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.dataset.period) {
                    currentPeriod = btn.dataset.period;
                    renderUI();
                }
            });
        });

        document.querySelectorAll('.revenue-view-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                revenueGranularity = btn.dataset.revenueView || 'day';
                renderUI();
            });
        });

        document.getElementById('toggle-product-chart-mode')?.addEventListener('click', () => {
            if (selectedProductCategory) {
                selectedProductCategory = null;
                productChartMode = 'categories';
            } else {
                productChartMode = productChartMode === 'categories' ? 'products' : 'categories';
            }
            renderUI();
        });

        // CUSTOM DATE LOGIC
        const btnCustom = document.getElementById('btn-custom-date');
        const popover = document.getElementById('custom-date-popover');

        if (btnCustom && popover) {
            btnCustom.addEventListener('click', (e) => {
                e.stopPropagation();
                popover.style.display = popover.style.display === 'none' ? 'block' : 'none';
            });

            popover.addEventListener('click', (e) => e.stopPropagation());

            document.getElementById('apply-custom-date').addEventListener('click', () => {
                const start = document.getElementById('custom-start').value;
                const end = document.getElementById('custom-end').value;
                if (start && end) {
                    currentPeriod = { start, end };
                    renderUI(); // Re-render with new period
                }
            });

            // Close when clicking outside
            document.addEventListener('click', () => {
                popover.style.display = 'none';
            });
        }

        document.getElementById('filter-status').addEventListener('change', (e) => {
            filters.status = e.target.value;
            selectedOrderIds.clear();
            applyFilters();
        });

        document.getElementById('open-inventory-btn')?.addEventListener('click', () => router.navigate(ROUTES.INVENTORY));
        document.getElementById('archive-selected-orders')?.addEventListener('click', async () => {
            const ids = [...selectedOrderIds];
            if (ids.length === 0) return;

            if (!confirm(`Archive ${ids.length} selected order${ids.length === 1 ? '' : 's'}? They will be hidden from the active Orders list.`)) {
                return;
            }

            const { orderService } = await import("../services/orderService.js");
            const { gamificationService } = await import("../services/gamificationService.js");
            await orderService.archiveOrders(ids);
            await gamificationService.awardAction('ordersArchived', ids.length);
            allOrders = allOrders.filter(order => !selectedOrderIds.has(order.id));
            selectedOrderIds.clear();
            applyFilters();
        });

        const alertStrip = document.getElementById('risk-alert');
        if (alertStrip) {
            alertStrip.addEventListener('click', () => {
                filters.status = 'overdue';
                document.getElementById('filter-status').value = 'overdue';
                applyFilters();
            });
        }

        document.getElementById('create-order-btn').addEventListener('click', () => router.navigate(ROUTES.CREATE_ORDER));

        // Global functions for actions
        window.markAsPaid = async (id, button = null) => {
            if (pendingCheckmarkUpdates.has(id) || updatedCheckmarkUpdates.has(id)) {
                return;
            }

            pendingCheckmarkUpdates.add(id);
            if (button) {
                button.disabled = true;
                button.classList.add('is-pending');
                button.title = 'Updating...';
            }
            scheduleInvoiceListRefresh(6000);

            const { orderService } = await import("../services/orderService.js");
            const { gamificationService } = await import("../services/gamificationService.js");
            try {
                await orderService.updateOrderStatus(id, 'paid');
                await gamificationService.awardAction('ordersPaid');
                pendingCheckmarkUpdates.delete(id);
                updatedCheckmarkUpdates.add(id);
                updateLocalOrder(id, {
                    status: 'paid',
                    paidAt: new Date(),
                    updatedAt: new Date()
                });
                refreshTable();
            } catch (error) {
                pendingCheckmarkUpdates.delete(id);
                if (button) {
                    button.disabled = false;
                    button.classList.remove('is-pending', 'is-updated');
                    button.title = 'Mark Paid';
                }
                notificationService.error(error.message || t('msg_update_fail'));
            }
        };

        window.markAsFulfilled = async (id) => {
            const { orderService } = await import("../services/orderService.js");
            const { gamificationService } = await import("../services/gamificationService.js");
            await orderService.updateOrderStatus(id, 'fulfilled');
            await gamificationService.awardAction('ordersFulfilled');
            renderDashboard();
        };

        window.viewOrder = (id) => router.navigate(ROUTES.ORDER_DETAIL.replace(':id', id));

        window.printOrder = async (id) => {
            try {
                const { invoiceController } = await import("../controllers/invoiceController.js");
                const orderSnapshot = allOrders.find(order => order.id === id) || null;
                const invoiceId = await invoiceController.generateForOrder(id, orderSnapshot);
                if (invoiceId) {
                    router.navigate(ROUTES.INVOICE_DETAIL.replace(':id', invoiceId));
                }
            } catch (e) {
                console.error("Error navigating to invoice:", e);
            }
        };

        window.togglePrinted = async (id, isPrintedState) => {
            const { orderService } = await import("../services/orderService.js");
            await orderService.updateOrder(id, { isPrinted: isPrintedState });
            renderDashboard();
        };

        window.deleteOrder = async (id) => {
            if (confirm(t('confirm_delete_draft'))) {
                const { orderService } = await import("../services/orderService.js");
                await orderService.deleteOrder(id);
                renderDashboard();
            }
        };
    };

    renderUI();
};
