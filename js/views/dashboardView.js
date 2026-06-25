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

function escapeHtml(value = '') {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

const ICONS = {
    orders: '<path d="M6 2h9l3 3v15a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z"/><path d="M14 2v4h4"/><path d="M8 11h8"/><path d="M8 15h6"/>',
    revenue: '<path d="M3 17l6-6 4 4 7-8"/><path d="M14 7h6v6"/>',
    balance: '<path d="M12 3v18"/><path d="M5 7h14"/><path d="M6 7l-3 6h6L6 7Z"/><path d="M18 7l-3 6h6l-3-6Z"/>',
    average: '<path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 16v-4"/><path d="M12 16V8"/><path d="M16 16v-6"/>',
    plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
    calendar: '<path d="M8 2v4"/><path d="M16 2v4"/><path d="M3 10h18"/><rect x="3" y="4" width="18" height="18" rx="2"/>',
    alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    inventory: '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
    trend: '<path d="M3 3v18h18"/><path d="m7 14 4-4 3 3 5-7"/>',
    print: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/>',
    view: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    package: '<path d="m7.5 4.3 9 5.2"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
    trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/>',
    check: '<path d="M20 6 9 17l-5-5"/>'
};

function icon(name, className = '') {
    return `
        <svg class="${className}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            ${ICONS[name] || ICONS.orders}
        </svg>
    `;
}

export const renderDashboard = async () => {
    layoutView.render();
    layoutView.updateTitle(t("sidebar_orders"));

    const container = document.getElementById('page-container');
    const cachedDashboard = dashboardController.getCachedDashboard();
    const hasCachedDashboard = cachedDashboard && cachedDashboard.meta && cachedDashboard.meta.cacheHit === true;
    if (!hasCachedDashboard) {
        container.innerHTML = LoadingSkeleton();
    }

    // Internal State
    let allOrders = [];
    let activeOrders = [];
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
    const getActiveOrders = (orders = []) => orders.filter(order => order.archived !== true);

    // Initial Fetch
    const today = new Date().toISOString().split('T')[0];
    let shouldRunBackgroundRefresh = false;
    let initialDashboardResult = cachedDashboard;
    let initialInventoryData = [];

    if (hasCachedDashboard) {
        shouldRunBackgroundRefresh = dashboardController.shouldRefreshDashboard();
        console.info('[PERF] Orders first visible render: memory cache path selected');
    } else {
        const loadedDashboard = await dashboardController.loadDashboard({ source: 'orders-view' });
        initialDashboardResult = loadedDashboard;
        initialInventoryData = [];
        shouldRunBackgroundRefresh = loadedDashboard.meta && loadedDashboard.meta.shouldRefresh === true;
    }

    const orders = initialDashboardResult && initialDashboardResult.orders ? initialDashboardResult.orders : [];
    const loadedReturnOrders = initialDashboardResult && initialDashboardResult.returnOrders ? initialDashboardResult.returnOrders : [];
    const loadedReturnInvoices = initialDashboardResult && initialDashboardResult.returnInvoices ? initialDashboardResult.returnInvoices : [];
    allOrders = orders;
    activeOrders = getActiveOrders(allOrders);
    returnOrders = loadedReturnOrders;
    returnInvoices = loadedReturnInvoices;
    filteredOrders = [...activeOrders];
    inventoryCategories = initialInventoryData;

    const getScrollPosition = () => container.scrollTop || 0;

    const restoreScrollPosition = (scrollTop) => {
        requestAnimationFrame(() => {
            container.scrollTop = scrollTop;
        });
    };

    const refreshDashboardDataPreservingState = async () => {
        const scrollTop = getScrollPosition();
        const [{ orders: refreshedOrders, returnOrders: refreshedReturnOrders = [], returnInvoices: refreshedReturnInvoices = [] }, refreshedInventoryData] = await Promise.all([
            dashboardController.refreshDashboard({ source: 'orders-background-refresh' }),
            inventoryController.loadInventoryData(today)
        ]);

        allOrders = refreshedOrders;
        activeOrders = getActiveOrders(allOrders);
        returnOrders = refreshedReturnOrders;
        returnInvoices = refreshedReturnInvoices;
        inventoryCategories = refreshedInventoryData;
        pendingCheckmarkUpdates.clear();
        updatedCheckmarkUpdates.clear();
        renderUI();
        restoreScrollPosition(scrollTop);
    };


    const refreshInventoryStrip = async () => {
        const refreshedInventoryData = await inventoryController.loadInventoryData(today);
        inventoryCategories = refreshedInventoryData;
        renderUI();
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
        activeOrders.forEach(applyUpdate);
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
                ${icon('check', 'button-icon')}
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
        const workQueueLanes = getWorkQueueLanes();
        const lowStockProducts = getLowStockProducts(inventoryCategories);

        container.innerHTML = `
            <div class="dashboard-v2 animate-fade-in">
                <div class="dashboard-toolbar">
                    <div class="dashboard-title-block">
                        <span class="dashboard-eyebrow">Kyrgyz Organics</span>
                        <h1>Orders Overview</h1>
                        <p>Invoices, fulfillment, stock, and payment follow-up in one workspace.</p>
                    </div>
                    <div class="dashboard-toolbar-actions">
                        <div class="segmented-control dashboard-period-control">
                            ${['today', '7d', '30d'].map(p => `
                                <button class="time-btn ${currentPeriod === p ? 'active' : ''}" data-period="${p}">${p === '7d' ? '7 Days' : p === '30d' ? '30 Days' : 'Today'}</button>
                            `).join('')}
                            <div class="date-popover-wrap">
                                <button id="btn-custom-date" class="time-btn ${typeof currentPeriod === 'object' ? 'active' : ''}">${icon('calendar', 'inline-icon')} Custom</button>
                                <div id="custom-date-popover" class="date-popover" style="display: none;">
                                    <div class="date-popover-inputs">
                                        <input type="date" id="custom-start">
                                        <input type="date" id="custom-end">
                                    </div>
                                    <button id="apply-custom-date" class="btn btn-primary btn-sm">Apply</button>
                                </div>
                            </div>
                        </div>
                        <button id="create-order-btn" class="btn btn-primary dashboard-new-order">${icon('plus', 'button-icon')} ${t('dash_new_order')}</button>
                    </div>
                </div>

                ${alerts ? `
                    <button id="risk-alert" class="dashboard-alert-strip" type="button">
                        ${icon('alert', 'button-icon')} ${escapeHtml(alerts.label)}
                    </button>
                ` : ''}

                <div class="dashboard-kpi-grid grid-cols-mobile-2">
                    ${renderKPICard("Orders", stats.metrics.orders, false, false, 'orders')}
                    ${renderKPICard("Confirmed Revenue", stats.metrics.revenue, true, false, 'revenue')}
                    ${renderKPICard("Outstanding", stats.metrics.outstanding, true, true, 'balance')}
                    ${renderKPICard("AOV", stats.metrics.aov, true, false, 'average')}
                </div>

                <div class="dashboard-main-grid">
                    <section class="dashboard-card revenue-card">
                        <div class="dashboard-card-header">
                            <div>
                                <h2>Confirmed Revenue Trend</h2>
                                <p>Confirmed, fulfilled, and paid orders grouped by ${revenueGranularity}.</p>
                            </div>
                            <div class="segmented-control compact-control">
                                ${['day', 'week', 'month'].map(view => `
                                    <button class="revenue-view-btn ${revenueGranularity === view ? 'active' : ''}" data-revenue-view="${view}">${view}</button>
                                `).join('')}
                            </div>
                        </div>
                        <div class="chart-frame">
                            ${(stats.charts.revenueOverTime.confirmedRevenue || []).some(value => value > 0)
                ? '<canvas id="chart-revenue"></canvas>'
                : '<div class="empty-state">No confirmed revenue in this range yet.</div>'}
                        </div>
                    </section>

                    ${renderAttentionPanel(workQueueLanes, lowStockProducts)}
                </div>

                ${renderInventoryStrip(inventoryCategories)}

                <div class="dashboard-lower-grid">
                    <section class="dashboard-card recent-orders-card">
                        <div class="dashboard-card-header recent-orders-header">
                            <div>
                                <h2>${t('dash_recent_orders')}</h2>
                                <p>Sorted by date with the same view, print, pay, fulfill, and archive workflows.</p>
                            </div>
                            <div class="orders-table-tools">
                                <span class="metric-pill visible-orders-count">${filteredOrders.length} visible</span>
                                <span id="selected-orders-count" class="metric-pill selected-count" style="display: none;">0 selected</span>
                                <button id="archive-selected-orders" class="btn btn-secondary btn-sm" disabled>Archive Selected</button>
                                <select id="filter-status" class="dashboard-select">
                                    <option value="all" ${filters.status === 'all' ? 'selected' : ''}>Status: All</option>
                                    <option value="needs_invoice" ${filters.status === 'needs_invoice' ? 'selected' : ''}>Needs Invoice</option>
                                    <option value="needs_printing" ${filters.status === 'needs_printing' ? 'selected' : ''}>Needs Printing</option>
                                    <option value="due-today" ${filters.status === 'due-today' ? 'selected' : ''}>Due Today</option>
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
                        <div id="orders-table-wrapper" class="orders-table-wrapper"></div>
                    </section>

                    ${renderTopProductsList(productChart)}
                </div>

                <div class="dashboard-side-grid">
                    <section class="dashboard-card">
                        <div class="dashboard-card-header">
                            <div>
                                <h2>Order Pipeline</h2>
                                <p>Current orders by stage using existing statuses and return state.</p>
                        </div>
                    </div>
                        ${renderPipeline(stats.charts.statusPipeline)}
                    </section>

                    <section class="dashboard-card hide-mobile">
                        <div class="dashboard-card-header">
                            <div>
                                <h2>Adjusted Units</h2>
                                <p>Final adjusted quantities across the selected date range.</p>
                            </div>
                        </div>
                        <div class="mini-chart-frame">
                            ${(stats.charts.unitDemandOverTime.data || []).some(value => value > 0)
                ? '<canvas id="chart-units"></canvas>'
                : '<div class="empty-state compact">No unit demand in this range.</div>'}
                        </div>
                    </section>
                </div>

                ${renderReturnAnalytics(stats.charts.returnedItems)}
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

    const getLowStockProducts = (categories = []) => categories
        .flatMap(category => (category.products || []).map(product => ({ ...product, categoryName: category.name || category.title || '' })))
        .filter(product => Number(product.left ?? 0) <= 5)
        .sort((a, b) => Number(a.left ?? 0) - Number(b.left ?? 0));

    const renderKPICard = (label, data = {}, isCurrency, inverted = false, iconName = 'orders') => {
        const delta = Number(data.delta || 0);
        const isUp = delta > 0;
        const isFlat = delta === 0;
        const trendClass = isFlat ? 'neutral' : (inverted ? (isUp ? 'attention' : 'positive') : (isUp ? 'positive' : 'attention'));
        const trendLabel = inverted
            ? (isFlat ? 'steady balance' : (isUp ? 'balance up' : 'balance down'))
            : (isFlat ? 'steady' : `${isUp ? 'up' : 'down'} ${Math.abs(delta)}%`);
        const displayValue = isCurrency ? formatCurrency(data.value || 0) : (data.value || 0);

        return `
            <section class="dashboard-kpi-card ${inverted ? 'attention-metric' : ''}">
                <div class="kpi-card-top">
                    <span class="kpi-icon">${icon(iconName, 'kpi-svg')}</span>
                    <span class="kpi-trend ${trendClass}">${isFlat ? '-' : (isUp ? '↑' : '↓')} ${trendLabel}</span>
                </div>
                <div>
                    <div class="kpi-label">${escapeHtml(label)}</div>
                    <div class="kpi-value">${displayValue}</div>
                </div>
                <div class="kpi-spark" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
                <div class="kpi-caption">vs prior period</div>
            </section>
        `;
    };

    const renderAttentionPanel = (lanes, lowStockProducts) => {
        const attentionItems = lanes
            .filter(lane => lane.count > 0 && lane.id !== 'ready_archive')
            .slice(0, 5);

        return `
            <aside class="dashboard-card attention-panel">
                <div class="dashboard-card-header">
                    <div>
                        <h2>Today&apos;s Actions</h2>
                        <p>Calculated from current orders, invoices, returns, and inventory.</p>
                    </div>
                    <button type="button" class="btn btn-secondary btn-sm work-queue-lane-reset">Show All</button>
                </div>
                <div class="attention-list">
                    ${attentionItems.length ? attentionItems.map(item => `
                        <button type="button" class="attention-item work-queue-lane ${filters.status === item.id ? 'active' : ''}" data-work-filter="${item.id}">
                            <span class="attention-count">${item.count}</span>
                            <span>
                                <strong>${escapeHtml(item.title)}</strong>
                                <small>${escapeHtml(item.action)}</small>
                            </span>
                        </button>
                    `).join('') : '<div class="empty-state compact">No urgent order actions for the selected data.</div>'}
                </div>
                ${lowStockProducts.length ? `
                    <div class="attention-stock">
                        <div class="attention-stock-header">
                            <strong>Low Stock</strong>
                            <button type="button" id="open-inventory-btn" class="text-link-btn">Open Inventory</button>
                        </div>
                        ${lowStockProducts.slice(0, 4).map(product => `
                            <div class="attention-stock-row">
                                <span>${escapeHtml(product.displayName || product.name || 'Product')}</span>
                                <strong>${Number(product.left ?? 0)} left</strong>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
            </aside>
        `;
    };

    const renderTopProductsList = (productChart) => {
        const rows = (productChart.fullLabels || productChart.labels || []).map((label, index) => ({
            label,
            units: productChart.data?.[index] || 0,
            revenue: productChart.revenue?.[index] || 0,
            id: productChart.ids?.[index] || label
        })).filter(row => row.units > 0);

        return `
            <section class="dashboard-card top-products-card">
                <div class="dashboard-card-header">
                    <div>
                        <h2>${escapeHtml(productChart.title.replace(/_/g, ' '))}</h2>
                        <p>${escapeHtml(productChart.subtitle)}</p>
                    </div>
                    <button id="toggle-product-chart-mode" class="btn btn-secondary btn-sm">${escapeHtml(productChart.buttonLabel)}</button>
                </div>
                <div class="ranked-product-list">
                    ${rows.length ? rows.map((row, index) => `
                        <button type="button" class="ranked-product-row ${productChart.mode === 'categories' ? 'is-clickable product-category-row' : ''}" data-category-index="${index}">
                            <span class="rank-number">${index + 1}</span>
                            <span class="rank-product-main">
                                <strong>${escapeHtml(row.label)}</strong>
                                <small>${row.units} adjusted units</small>
                            </span>
                            <span class="rank-revenue">${formatCurrency(row.revenue)}</span>
                        </button>
                    `).join('') : '<div class="empty-state compact">No product movement in this range.</div>'}
                </div>
            </section>
        `;
    };

    const renderPipeline = (pipeline) => {
        const max = Math.max(...(pipeline.data || [0]), 1);

        return `
            <div class="pipeline-rail">
                ${(pipeline.labels || []).map((label, index) => {
            const count = pipeline.data?.[index] || 0;
            const percent = Math.max(4, Math.round((count / max) * 100));
            const key = label.toLowerCase().replace(/\s+/g, '-');

            return `
                        <button type="button" class="pipeline-stage pipeline-${key}" data-pipeline-status="${key}">
                            <span class="pipeline-stage-top">
                                <strong>${escapeHtml(label)}</strong>
                                <span>${count}</span>
                            </span>
                            <span class="pipeline-meter"><span style="width: ${percent}%;"></span></span>
                        </button>
                    `;
        }).join('')}
            </div>
        `;
    };

    const getWorkQueueLanes = () => {
        const payableStatuses = ['confirmed', 'fulfilled', 'fullfilled'];
        const lanes = [
            {
                id: 'needs_invoice',
                title: 'Needs Invoice',
                action: 'Confirm or generate',
                tone: '#eff6ff',
                count: activeOrders.filter(order => ['draft', 'pending'].includes(order.status)).length
            },
            {
                id: 'needs_printing',
                title: 'Needs Printing',
                action: 'Print customer copy',
                tone: '#fff7ed',
                count: activeOrders.filter(order => payableStatuses.includes(order.status) && !order.isPrinted).length
            },
            {
                id: 'due-today',
                title: 'Due Today',
                action: 'Collect or fulfill',
                tone: '#fefce8',
                count: activeOrders.filter(order => order.agingDays === 0 && payableStatuses.includes(order.status)).length
            },
            {
                id: 'overdue',
                title: 'Overdue',
                action: 'Follow up',
                tone: '#fef2f2',
                count: activeOrders.filter(order => order.agingDays >= 1 && payableStatuses.includes(order.status)).length
            },
            {
                id: 'any_return',
                title: 'Returns Pending',
                action: 'Review returned items',
                tone: '#fff7ed',
                count: activeOrders.filter(order => isReturnFilterMatch(order, 'any_return') || order.returnRequested).length
            },
            {
                id: 'ready_archive',
                title: 'Ready to Archive',
                action: 'Clean active list',
                tone: '#f0fdf4',
                count: activeOrders.filter(order => ['paid', 'returned', 'fully_returned'].includes(order.status) || isReturnFilterMatch(order, 'returned')).length
            }
        ];

        return lanes;
    };

    const renderWorkQueue = (lanes) => `
        <section class="card" style="padding: 12px; margin: 0;">
            <div style="display: flex; justify-content: space-between; gap: 12px; align-items: center; margin-bottom: 10px; flex-wrap: wrap;">
                <div>
                    <h3 style="font-size: 13px; font-weight: 900; margin: 0;">Today&apos;s Work Queue</h3>
                    <div style="font-size: 11px; color: var(--color-gray-500); margin-top: 2px;">Tap a lane to focus the orders table on the next action.</div>
                </div>
                <button type="button" class="btn btn-secondary btn-sm work-queue-lane-reset" style="font-size: 11px; padding: 4px 10px;">Show All</button>
            </div>
            <div class="work-queue-grid">
                ${lanes.map(lane => `
                    <button type="button" class="work-queue-lane ${filters.status === lane.id ? 'active' : ''}" data-work-filter="${lane.id}" style="background: ${lane.tone}; text-align: left;">
                        <span class="work-queue-count">${lane.count}</span>
                        <span class="work-queue-title">${lane.title}</span>
                        <span class="work-queue-action">${lane.action}</span>
                    </button>
                `).join('')}
            </div>
        </section>
    `;

    const renderInventoryStrip = (categories) => {
        const products = categories
            .flatMap(cat => cat.products || [])
            .sort((a, b) => (a.left ?? 0) - (b.left ?? 0));

        if (products.length === 0) {
            return '';
        }

        return `
            <div class="dashboard-card inventory-strip">
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
                    ? `<img src="${product.imageUrl}" alt="${escapeHtml(product.displayName || product.name || 'Product')}" style="width: 100%; height: 100%; object-fit: cover;">`
                    : '<div style="display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; font-size: 12px; font-weight: 900; color: var(--color-primary-700);">KO</div>'}
                                </div>
                                <div style="min-width: 0; display: flex; flex-direction: column; gap: 3px;">
                                    <div style="font-size: 12px; font-weight: 700; color: var(--color-gray-900); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                        ${escapeHtml(product.displayName || product.name || 'Product')}
                                    </div>
                                    <div style="font-size: 10px; color: ${tone.label}; font-weight: 700; text-transform: uppercase; letter-spacing: 0;">
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
        const customerRows = (returns.byCustomer || []).slice(0, 4);
        const sourceRows = (returns.bySource || []).slice(0, 2);
        const returnPercent = Number(returns.returnPercent || 0).toFixed(1);

        return `
            <div class="card" style="padding: 12px; margin: 0; display: grid; grid-template-columns: minmax(220px, 0.8fr) minmax(260px, 1.2fr) minmax(260px, 1fr); gap: 12px; align-items: stretch;">
                <div style="display: flex; flex-direction: column; gap: 10px;">
                    <div>
                        <h3 style="font-size: 12px; font-weight: 800; color: var(--color-gray-800); margin: 0;">Total returned</h3>
                        <div style="font-size: 10px; color: var(--color-gray-400); margin-top: 2px;">Invoice returns and courier returns. Deleted/cancelled orders excluded.</div>
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 8px;">
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
                        <div style="background: #f0fdfa; border: 1px solid #99f6e4; border-radius: 8px; padding: 10px;">
                            <div style="font-size: 10px; color: #0f766e; font-weight: 800; text-transform: uppercase;">Return %</div>
                            <div style="font-size: 20px; color: #0f766e; font-weight: 900; margin-top: 6px;">${returnPercent}%</div>
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
                            <div style="display: grid; grid-template-columns: 1fr auto auto auto; gap: 10px; align-items: center; font-size: 12px; padding: 8px; background: var(--color-gray-50); border-radius: 6px;">
                                <span style="font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${row.productName}</span>
                                <span style="font-weight: 900; color: #b45309;">${row.quantity}</span>
                                <span style="font-weight: 900; color: #0f766e;">${Number(row.returnPercent || 0).toFixed(1)}%</span>
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
                    <h4 style="font-size: 11px; font-weight: 800; color: var(--color-gray-500); margin: 12px 0 8px;">RETURNS BY CUSTOMER</h4>
                    <div style="display: grid; gap: 6px;">
                        ${customerRows.length ? customerRows.map(row => `
                            <div style="display: grid; grid-template-columns: 1fr auto auto; gap: 10px; align-items: center; font-size: 12px; padding: 8px; background: #eff6ff; border-radius: 6px;">
                                <span style="font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${row.customerName}</span>
                                <span style="font-weight: 900; color: #2563eb;">${row.quantity}</span>
                                <span style="font-weight: 800; color: var(--color-gray-600);">${formatCurrency(row.amount)}</span>
                            </div>
                        `).join('') : '<div style="padding: 12px; color: var(--color-gray-500); font-size: 12px; background: var(--color-gray-50); border-radius: 8px;">No customer returns in this period.</div>'}
                    </div>
                </div>
            </div>
        `;
    };

    const initCharts = (chartData, productChart) => {
        const ctxRev = document.getElementById('chart-revenue')?.getContext('2d');
        const ctxUnits = document.getElementById('chart-units')?.getContext('2d');
        const ctxReturns = document.getElementById('chart-returns');

        // Revenue Chart (Line) - Compact
        if (ctxRev) {
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
        }

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
        if (ctxUnits) {
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
        }

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
        filteredOrders = activeOrders.filter(o => {
            const matchesStatus = filters.status === 'all' ? true :
                filters.status === 'needs_invoice' ? ['draft', 'pending'].includes(o.status) :
                filters.status === 'needs_printing' ? (!o.isPrinted && ['confirmed', 'fulfilled', 'fullfilled'].includes(o.status)) :
                filters.status === 'ready_archive' ? (['paid', 'returned', 'fully_returned'].includes(o.status) || isReturnFilterMatch(o, 'returned')) :
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
                            <button class="btn-icon" onclick="event.stopPropagation(); window.playClickAnimation(event, 'print'); window.printOrder('${row.id}')" title="Print Invoice" style="color: ${row.isPrinted ? '#0f7a46' : '#b45309'}; background: transparent; padding: 2px;">
                                ${icon('print', 'button-icon')}
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
            mobileCard: (row) => `
                <div style="display: grid; gap: 10px;">
                    <div style="display: flex; justify-content: space-between; gap: 10px; align-items: flex-start;">
                        <label style="display: flex; gap: 8px; align-items: center; min-width: 0;">
                            <input
                                type="checkbox"
                                class="order-select-checkbox"
                                data-id="${row.id}"
                                ${selectedOrderIds.has(row.id) ? 'checked' : ''}
                                onclick="event.stopPropagation();"
                            >
                            <span style="min-width: 0;">
                                <strong style="display: block; color: var(--color-gray-900); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(row.customerName || 'Customer')}</strong>
                                <small style="color: var(--color-gray-500);">#${escapeHtml(String(row.id || '').slice(-6))} · ${formatDate(row.orderDate)}</small>
                            </span>
                        </label>
                        ${createStatusBadge(row)}
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; font-size: 12px;">
                        <div><span style="display: block; color: var(--color-gray-500);">Total</span><strong>${formatCurrency(row.totalAmount)}</strong></div>
                        <div><span style="display: block; color: var(--color-gray-500);">Due</span><strong>${row.status === 'paid' || row.status === 'draft' ? '-' : (row.agingDays === 0 ? 'Today' : `${row.agingDays || 0}d`)}</strong></div>
                        <div><span style="display: block; color: var(--color-gray-500);">Print</span><strong>${row.isPrinted ? 'Printed' : 'Needed'}</strong></div>
                    </div>
                    <div style="display: flex; gap: 6px; justify-content: flex-end; align-items: center;">
                        ${row.status === 'confirmed' ? `<button class="btn-icon" onclick="event.stopPropagation(); window.playClickAnimation(event, 'fulfill'); window.markAsFulfilled('${row.id}')" title="Mark Fulfilled" style="color: #0f766e; background: #ecfdf5;">${icon('package', 'button-icon')}</button>` : ''}
                        ${['confirmed', 'fulfilled', 'fullfilled'].includes(row.status) || pendingCheckmarkUpdates.has(row.id) || updatedCheckmarkUpdates.has(row.id) ? renderPayCheckmarkButton(row) : ''}
                        <button class="btn-icon" onclick="event.stopPropagation(); window.printOrder('${row.id}')" title="Print Invoice">${icon('print', 'button-icon')}</button>
                        <button class="btn-icon" onclick="event.stopPropagation(); window.viewOrder('${row.id}')" title="View">${icon('view', 'button-icon')}</button>
                    </div>
                </div>
            `,
            actions: (row) => `
                <div style="display: flex; gap: 6px; justify-content: flex-end; align-items: center;">
                    ${row.status === 'confirmed' ? `
                        <button class="btn-icon" onclick="event.stopPropagation(); window.playClickAnimation(event, 'fulfill'); window.markAsFulfilled('${row.id}')" title="Mark Fulfilled" style="color: #0f766e; background: #ecfdf5;">
                            ${icon('package', 'button-icon')}
                        </button>
                    ` : ''}
                    ${['confirmed', 'fulfilled', 'fullfilled'].includes(row.status) || pendingCheckmarkUpdates.has(row.id) || updatedCheckmarkUpdates.has(row.id) ? renderPayCheckmarkButton(row) : ''}
                     <button class="btn-icon" onclick="event.stopPropagation(); window.viewOrder('${row.id}')" title="View">
                         ${icon('view', 'button-icon')}
                    </button>
                    ${row.status === 'draft' ? `<button class="btn-icon" onclick="event.stopPropagation(); window.playClickAnimation(event, 'delete'); window.deleteOrder('${row.id}')" title="Archive Draft">${icon('trash', 'button-icon')}</button>` : ''}
                </div>
            `
        });

        const wrapper = document.getElementById('orders-table-wrapper');
        if (!wrapper) return;
        wrapper.innerHTML = table.render();

        const visibleCount = document.querySelector('.visible-orders-count');
        if (visibleCount) {
            visibleCount.textContent = `${filteredOrders.length} visible`;
        }

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

        document.querySelectorAll('.product-category-row').forEach(row => {
            row.addEventListener('click', () => {
                if (productChartMode !== 'categories') return;
                const index = Number(row.dataset.categoryIndex);
                const stats = dashboardController.loadStats(allOrders, currentPeriod, revenueGranularity, returnInvoices, returnOrders);
                const categoryChart = stats.charts.topCategories;
                selectedProductCategory = {
                    id: categoryChart.ids[index],
                    name: categoryChart.fullLabels[index] || categoryChart.labels[index]
                };
                renderUI();
            });
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

        document.querySelectorAll('.work-queue-lane').forEach(button => {
            button.addEventListener('click', () => {
                filters.status = button.dataset.workFilter || 'all';
                selectedOrderIds.clear();
                const select = document.getElementById('filter-status');
                if (select) select.value = filters.status;
                applyFilters();
                document.querySelectorAll('.work-queue-lane').forEach(lane => lane.classList.toggle('active', lane === button));
            });
        });

        document.querySelector('.work-queue-lane-reset')?.addEventListener('click', () => {
            filters.status = 'all';
            selectedOrderIds.clear();
            const select = document.getElementById('filter-status');
            if (select) select.value = 'all';
            applyFilters();
            document.querySelectorAll('.work-queue-lane').forEach(lane => lane.classList.remove('active'));
        });

        document.querySelectorAll('.pipeline-stage').forEach(stage => {
            stage.addEventListener('click', () => {
                const normalized = stage.dataset.pipelineStatus || 'all';
                filters.status = normalized === 'partially-returned' ? 'partially_returned' : normalized;
                selectedOrderIds.clear();
                const select = document.getElementById('filter-status');
                if (select) select.value = filters.status;
                applyFilters();
            });
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
            ids.forEach(function(orderId) {
                dashboardController.updateCachedOrder(orderId, { archived: true, archivedAt: new Date(), updatedAt: new Date() }, 'archive-orders');
            });
            await gamificationService.awardAction('ordersArchived', ids.length);
            allOrders.forEach(order => {
                if (selectedOrderIds.has(order.id)) {
                    order.archived = true;
                }
            });
            activeOrders = activeOrders.filter(order => !selectedOrderIds.has(order.id));
            selectedOrderIds.clear();
            renderUI();
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
                dashboardController.updateCachedOrder(id, { status: 'paid', paidAt: new Date(), updatedAt: new Date() }, 'mark-paid');
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
            dashboardController.updateCachedOrder(id, { status: 'fulfilled', fulfilledAt: new Date(), updatedAt: new Date() }, 'mark-fulfilled');
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
            dashboardController.updateCachedOrder(id, { isPrinted: isPrintedState, updatedAt: new Date() }, 'toggle-printed');
            renderDashboard();
        };

        window.deleteOrder = async (id) => {
            if (confirm('Archive this draft order? It will be hidden from the active Orders list, but the record will be kept.')) {
                const { orderService } = await import("../services/orderService.js");
                await orderService.deleteOrder(id);
                dashboardController.updateCachedOrder(id, { archived: true, archivedAt: new Date(), updatedAt: new Date() }, 'delete-order');
                renderDashboard();
            }
        };
    };

    const visibleRenderStartedAt = performance.now();
    renderUI();
    console.info('[PERF] Orders first visible render: ' + (performance.now() - visibleRenderStartedAt).toFixed(1) + ' ms');

    refreshInventoryStrip().catch(function(error) {
        console.warn('Inventory strip refresh failed.', error);
    });

    if (shouldRunBackgroundRefresh) {
        refreshDashboardDataPreservingState().catch(function(error) {
            console.warn('Orders background refresh failed.', error);
            notificationService.error('Orders refresh failed. Cached data is still visible.');
        });
    }
};
