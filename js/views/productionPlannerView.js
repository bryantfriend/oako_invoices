import { layoutView } from "./layoutView.js";
import sessionDataStore from "../services/sessionDataStore.js";
import { inventoryController } from "../controllers/inventoryController.js";
import { buildProductionPlan, getLocalDateKey, getTodayKey } from "../services/operationsPlanningService.js";

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getDefaultPlanDate() {
    var tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return getLocalDateKey(tomorrow);
}

function renderMetric(label, value, tone) {
    return '<article class="ops-metric-card ' + escapeHtml(tone || '') + '"><span>'
        + escapeHtml(label) + '</span><strong>' + escapeHtml(value) + '</strong></article>';
}

function renderPlanRow(row) {
    return '<article class="ops-plan-row ' + (row.required > 0 ? 'needs-production' : 'ready') + '">'
        + '<div><strong>' + escapeHtml(row.name) + '</strong><span>' + escapeHtml(row.orders) + ' order line' + (row.orders === 1 ? '' : 's') + '</span></div>'
        + '<div><span>Demand</span><strong>' + escapeHtml(row.demand) + '</strong></div>'
        + '<div><span>Available now</span><strong>' + escapeHtml(row.available) + '</strong></div>'
        + '<div><span>Produce</span><strong class="ops-produce-number">' + escapeHtml(row.required) + '</strong></div>'
        + '<div><span>After orders</span><strong>' + escapeHtml(row.surplus) + '</strong></div>'
        + '<div><span class="ops-risk-pill ' + (row.required > 0 ? 'critical' : 'current') + '">' + (row.required > 0 ? 'Shortage' : 'Ready') + '</span></div>'
        + '</article>';
}

async function loadPlan(dateKey) {
    var results = await Promise.all([
        sessionDataStore.loadOrders({ source: 'production-planner' }),
        inventoryController.loadInventoryData(getTodayKey(), {})
    ]);
    var orderResult = results[0] || {};
    return buildProductionPlan(orderResult.records || [], results[1] || [], dateKey);
}

export async function renderProductionPlanner(params) {
    var safeParams = params || {};
    var dateKey = safeParams.date || getDefaultPlanDate();
    layoutView.render('route-change');
    layoutView.updateTitle('Production Plan');
    var container = document.getElementById('page-container');
    container.innerHTML = '<section class="ops-page"><div class="ops-loading">Calculating product demand and available stock...</div></section>';

    var plan = await loadPlan(dateKey);
    container.innerHTML = '<section class="ops-page animate-fade-in">'
        + '<header class="ops-page-header"><div><span class="ops-eyebrow">Daily preparation</span><h1>Production planner</h1><p>Confirmed and pending demand compared with the stock currently available in Inventory.</p></div>'
        + '<div class="ops-toolbar"><label for="production-date">Delivery date</label><input class="input" id="production-date" type="date" value="' + escapeHtml(dateKey) + '"><button class="btn btn-secondary" id="print-production-plan">Print plan</button></div></header>'
        + '<div class="ops-metric-grid">'
        + renderMetric('Orders included', plan.orderCount, 'calm')
        + renderMetric('Units demanded', plan.unitsDemanded, 'attention')
        + renderMetric('Units to produce', plan.unitsToProduce, plan.unitsToProduce > 0 ? 'warning' : 'calm')
        + renderMetric('Product shortages', plan.shortages, plan.shortages > 0 ? 'danger' : 'calm')
        + '</div>'
        + '<section class="ops-panel"><div class="ops-panel-heading"><div><h2>Preparation list</h2><p>“Produce” is demand minus current available inventory.</p></div><span class="metric-pill">' + escapeHtml(dateKey) + '</span></div>'
        + '<div class="ops-plan-head"><span>Product</span><span>Demand</span><span>Available</span><span>Produce</span><span>Remaining</span><span>Status</span></div>'
        + '<div class="ops-plan-list">' + (plan.rows.length ? plan.rows.map(renderPlanRow).join('') : '<div class="ops-empty">No pending or confirmed orders are scheduled for this date.</div>') + '</div></section>'
        + '</section>';

    var dateInput = document.getElementById('production-date');
    if (dateInput) {
        dateInput.addEventListener('change', function() {
            renderProductionPlanner({ date: dateInput.value });
        });
    }
    var printButton = document.getElementById('print-production-plan');
    if (printButton) {
        printButton.addEventListener('click', function() {
            window.print();
        });
    }
}