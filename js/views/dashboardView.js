import { dashboardController } from "../controllers/dashboardController.js";
import { layoutView } from "./layoutView.js";
import { DataTable } from "../components/dataTable.js";
import { createStatusBadge } from "../components/statusBadge.js";
import { createCard } from "../components/card.js";
import { LoadingSkeleton } from "../components/loadingSkeleton.js";
import { router } from "../router.js";
import { ROUTES } from "../core/constants.js";
import { formatDate, formatCurrency } from "../core/formatters.js";

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
    layoutView.updateTitle("Dashboard Overview");

    const container = document.getElementById('page-container');
    container.innerHTML = LoadingSkeleton();

    // Internal State
    let allOrders = [];
    let filteredOrders = [];
    let currentPeriod = '30d';
    let filters = { status: 'all', drill: null };

    // Initial Fetch
    const { orders } = await dashboardController.loadDashboard();
    allOrders = orders;
    filteredOrders = [...allOrders];

    const renderUI = () => {
        cleanupCharts();
        const stats = dashboardController.loadStats(allOrders, currentPeriod);
        const alerts = dashboardController.getRiskAlerts(allOrders);

        container.innerHTML = `
            <div class="dashboard-v2 animate-fade-in" style="display: flex; flex-direction: column; gap: 16px; padding-bottom: 40px;">
                
                <!-- V5 DASHBOARD GRID -->
                <div style="
                    display: grid; 
                    grid-template-rows: auto auto auto auto 1fr; 
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
                        <button id="create-order-btn" class="btn btn-primary" style="padding: 6px 16px; border-radius: 6px; font-weight: 700; font-size: 12px;">+ New Order</button>
                    </div>

                    <!-- ROW 2: KPIs -->
                    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; height: 90px;">
                        ${renderKPICard("Orders", stats.metrics.orders, false)}
                        ${renderKPICard("Revenue", stats.metrics.revenue, true)}
                        ${renderKPICard("Outstanding", stats.metrics.outstanding, true, true)}
                        ${renderKPICard("AOV", stats.metrics.aov, true)}
                    </div>

                    <!-- ROW 3: MAIN CHART (REVENUE) -->
                    <div class="card" style="padding: 12px; margin: 0; display: flex; flex-direction: column; height: 160px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <h3 style="font-size: 12px; font-weight: 700; color: var(--color-gray-800);">Revenue Trend</h3>
                            <div style="display: flex; gap: 12px; font-size: 10px;">
                                <div style="display: flex; align-items: center; gap: 4px;"><span style="width: 8px; height: 8px; border-radius: 50%; background: #10b981;"></span> Collected</div>
                                <div style="display: flex; align-items: center; gap: 4px;"><span style="width: 8px; height: 8px; border-radius: 50%; background: #ef4444;"></span> Outstanding</div>
                            </div>
                        </div>
                        <div style="flex: 1; min-height: 0;">
                            <canvas id="chart-revenue"></canvas>
                        </div>
                    </div>

                    <!-- ROW 4: SECONDARY CHARTS (3 COL) -->
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; height: 140px;">
                         <!-- Volume -->
                        <div class="card" style="padding: 12px; margin: 0; display: flex; flex-direction: column;">
                            <h3 style="font-size: 11px; font-weight: 700; color: var(--color-gray-500); margin-bottom: 6px;">ORDER VOLUME</h3>
                            <div style="flex: 1; min-height: 0;">
                                <canvas id="chart-volume"></canvas>
                            </div>
                        </div>
                        <!-- Aging -->
                        <div class="card" style="padding: 12px; margin: 0; display: flex; flex-direction: column;">
                            <h3 style="font-size: 11px; font-weight: 700; color: var(--color-gray-500); margin-bottom: 6px;">OVERDUE AGING</h3>
                            <div style="flex: 1; min-height: 0;">
                                <canvas id="chart-aging"></canvas>
                            </div>
                        </div>
                        <!-- Concentration -->
                        <div class="card" style="padding: 12px; margin: 0; display: flex; flex-direction: column;">
                            <h3 style="font-size: 11px; font-weight: 700; color: var(--color-gray-500); margin-bottom: 6px;">TOP CUSTOMERS</h3>
                            <div style="flex: 1; min-height: 0;">
                                <canvas id="chart-concentration"></canvas>
                            </div>
                        </div>
                    </div>

                    <!-- ROW 5: TABLE (FLEX GROW) -->
                    <div class="card" style="padding: 0; margin: 0; display: flex; flex-direction: column; overflow: hidden; min-height: 0;">
                        <div style="padding: 8px 12px; border-bottom: 1px solid var(--color-gray-100); display: flex; justify-content: space-between; align-items: center; background: #fff;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <h3 style="font-size: 12px; font-weight: 700; color: var(--color-gray-800);">Recent Orders</h3>
                                <span style="background: #fee2e2; color: #b91c1c; font-size: 10px; font-weight: 800; padding: 2px 6px; border-radius: 4px;">${filteredOrders.length}</span>
                            </div>
                            <select id="filter-status" style="border: 1px solid #eee; border-radius: 4px; padding: 4px 8px; font-size: 11px; font-weight: 600;">
                                <option value="all">Status: All</option>
                                <option value="overdue">Overdue</option>
                                <option value="confirmed">Confirmed</option>
                                <option value="fulfilled">Fulfilled</option>
                                <option value="paid">Paid</option>
                            </select>
                        </div>
                        <div id="orders-table-wrapper" style="overflow-y: auto; flex: 1;"></div>
                    </div>

                </div>
            </div>
        `;

        initCharts(stats.charts);
        attachListeners();
        applyFilters();
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

    const initCharts = (chartData) => {
        const ctxRev = document.getElementById('chart-revenue').getContext('2d');
        const ctxVol = document.getElementById('chart-volume').getContext('2d');
        const ctxAging = document.getElementById('chart-aging').getContext('2d');
        const ctxConc = document.getElementById('chart-concentration').getContext('2d');

        // Revenue Chart (Line) - Compact
        chartInstances.rev = new Chart(ctxRev, {
            type: 'line',
            data: {
                labels: chartData.revenueOverTime.labels,
                datasets: [
                    {
                        label: 'Collected',
                        data: chartData.revenueOverTime.paid,
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
                    },
                    {
                        label: 'Outstanding',
                        data: chartData.revenueOverTime.outstanding,
                        borderColor: '#ef4444',
                        borderDash: [5, 5],
                        tension: 0.4,
                        borderWidth: 2,
                        pointRadius: 0
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
                y: { display: false, border: { display: false } }, // No Y axis
                x: { display: false, border: { display: false } }  // No X axis
            }
        };

        // Volume Chart
        chartInstances.vol = new Chart(ctxVol, {
            type: 'bar',
            data: {
                labels: chartData.revenueOverTime.labels,
                datasets: [{
                    label: 'Orders',
                    data: chartData.revenueOverTime.orders,
                    backgroundColor: '#3b82f6',
                    borderRadius: 2,
                    barThickness: 'flex',
                    maxBarThickness: 16
                }]
            },
            options: commonBarOptions
        });

        // Aging Chart
        chartInstances.aging = new Chart(ctxAging, {
            type: 'bar',
            data: {
                labels: ['Curr', '1-7', '8-30', '30+'],
                datasets: [{
                    data: chartData.aging.data,
                    backgroundColor: ['#10b981', '#f59e0b', '#f97316', '#ef4444'],
                    borderRadius: 3,
                    barThickness: 24
                }]
            },
            options: {
                ...commonBarOptions,
                scales: {
                    y: { display: false },
                    x: { display: true, grid: { display: false }, border: { display: false }, ticks: { font: { size: 9, weight: '700' }, color: '#64748b' } }
                }
            }
        });

        // Concentration Chart
        chartInstances.conc = new Chart(ctxConc, {
            type: 'bar',
            data: {
                labels: chartData.concentration.labels,
                datasets: [{
                    data: chartData.concentration.data,
                    backgroundColor: '#6366f1',
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
                scales: {
                    x: { display: false },
                    y: {
                        display: true,
                        grid: { display: false },
                        border: { display: false },
                        ticks: { font: { size: 9, weight: '600' }, color: '#475569', mirror: true, z: 1 } // Mirror labels onto bars? Maybe too risky. Let's just keep them small.
                    }
                }
            }
        });
    };

    const applyFilters = () => {
        filteredOrders = allOrders.filter(o => {
            const matchesStatus = filters.status === 'all' ? true :
                filters.status === 'overdue' ? (o.agingDays >= 1 && ['confirmed', 'fulfilled'].includes(o.status)) :
                    filters.status === 'due-today' ? (o.agingDays === 0 && ['confirmed', 'fulfilled'].includes(o.status)) :
                        o.status === filters.status;

            const matchesDrill = !filters.drill ? true :
                filters.drill.type === 'aging' ? (
                    filters.drill.value === 2 ? o.agingDays >= 30 :
                        filters.drill.value === 1 ? (o.agingDays >= 1 && o.agingDays < 30) :
                            (o.agingDays === 0 && ['confirmed', 'fulfilled'].includes(o.status))
                ) : true;

            return matchesStatus && matchesDrill;
        });
        refreshTable();
    };

    const refreshTable = () => {
        const table = new DataTable({
            columns: [
                {
                    key: 'status', label: 'Cat', align: 'center', render: (val, row) => {
                        const cat = (row.customerCategory || 'C');
                        return `<div style="width: 24px; height: 24px; border-radius: 4px; background: #f0f9ff; color: #0369a1; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 11px;">${cat}</div>`;
                    }
                },
                { key: 'id', label: 'Order ID', render: (val) => `<span style="color: #64748b; font-size: 11px;">#${val.slice(-6)}</span>` },
                { key: 'customerName', label: 'Customer', render: (val) => `<span style="font-weight: 700; color: #1e293b;">${val}</span>` },
                { key: 'orderDate', label: 'Date', render: (val) => formatDate(val) },
                { key: 'totalAmount', label: 'Total', align: 'right', render: (val) => `<span style="font-weight: 700;">${formatCurrency(val)}</span>` },
                {
                    key: 'agingDays',
                    label: 'Due',
                    align: 'right',
                    render: (val, row) => {
                        if (row.status === 'paid' || row.status === 'draft') return '-';
                        if (val === 0) return '<span style="color: #059669; font-weight: 700; font-size: 11px;">TODAY</span>';
                        return `<span style="font-weight: 800; color: #b91c1c;">${val}d Overdue</span>`;
                    }
                },
                { key: 'status', label: 'Status', align: 'center', render: (val) => createStatusBadge(val) }
            ],
            data: filteredOrders,
            onRowClick: (row) => router.navigate(ROUTES.ORDER_DETAIL.replace(':id', row.id)),
            actions: (row) => `
                <div style="display: flex; gap: 6px; justify-content: flex-end; align-items: center;">
                    ${row.status === 'confirmed' ? `
                        <button class="btn-icon" onclick="event.stopPropagation(); window.markAsFulfilled('${row.id}')" title="Mark Fulfilled" style="color: #6366f1; background: #eef2ff;">
                            📦
                        </button>
                    ` : ''}
                    ${['confirmed', 'fulfilled'].includes(row.status) ? `
                        <button class="btn-icon" onclick="event.stopPropagation(); window.markAsPaid('${row.id}')" title="Mark Paid" style="color: #10b981; background: #ecfdf5;">
                            ✓
                        </button>
                    ` : ''}
                    <button class="btn-icon" onclick="event.stopPropagation(); window.printOrder('${row.id}')" title="Invoice" style="color: #6366f1; background: #eef2ff;">
                        IP
                    </button>
                     <button class="btn-icon" onclick="event.stopPropagation(); window.viewOrder('${row.id}')" title="View">
                         <span style="opacity: 0.5; font-size: 12px;">👁️</span>
                    </button>
                    ${row.status === 'draft' ? `<button class="btn-icon" onclick="event.stopPropagation(); window.deleteOrder('${row.id}')"><span style="opacity: 0.5;">🗑️</span></button>` : ''}
                </div>
            `
        });

        const wrapper = document.getElementById('orders-table-wrapper');
        if (wrapper) wrapper.innerHTML = table.render();

        wrapper.querySelectorAll('.data-row').forEach(row => {
            row.addEventListener('click', () => {
                router.navigate(ROUTES.ORDER_DETAIL.replace(':id', row.dataset.id));
            });
        });
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
        window.markAsPaid = async (id) => {
            const { orderService } = await import("../services/orderService.js");
            await orderService.updateOrderStatus(id, 'paid');
            renderDashboard();
        };

        window.markAsFulfilled = async (id) => {
            const { orderService } = await import("../services/orderService.js");
            await orderService.updateOrderStatus(id, 'fulfilled');
            renderDashboard();
        };

        window.viewOrder = (id) => router.navigate(ROUTES.ORDER_DETAIL.replace(':id', id));

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

        window.deleteOrder = async (id) => {
            if (confirm("Delete this draft?")) {
                const { orderService } = await import("../services/orderService.js");
                await orderService.deleteOrder(id);
                renderDashboard();
            }
        };
    };

    renderUI();
};
