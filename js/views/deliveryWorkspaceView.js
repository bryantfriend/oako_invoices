import { layoutView } from "./layoutView.js";
import sessionDataStore from "../services/sessionDataStore.js";
import { customerService } from "../services/customerService.js";
import { orderService } from "../services/orderService.js";
import { notificationService } from "../core/notificationService.js";
import { formatCurrency } from "../core/formatters.js";
import { buildDeliveryRows, summarizeDeliveries, getTodayKey } from "../services/operationsPlanningService.js";
import { router } from "../router.js";
import { ROUTES } from "../core/constants.js";

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function normalizePhone(value) {
    return String(value || '').replace(/[^\d+]/g, '');
}

function renderMetric(label, value, tone) {
    return '<article class="ops-metric-card ' + escapeHtml(tone || '') + '"><span>'
        + escapeHtml(label) + '</span><strong>' + escapeHtml(value) + '</strong></article>';
}

function renderPackingItems(row) {
    if (!row.items.length) {
        return '<div class="ops-empty compact">No item lines saved.</div>';
    }

    return row.items.map(function(item, index) {
        var name = item.name || item.productName || 'Product';
        return '<label class="packing-check"><input type="checkbox" data-pack-order="' + escapeHtml(row.id) + '" data-pack-item="' + escapeHtml(index) + '"><span>'
            + escapeHtml(name) + '</span><strong>×' + escapeHtml(Number(item.quantity || 0)) + '</strong></label>';
    }).join('');
}

function renderDeliveryRow(row, stopNumber) {
    var phone = normalizePhone(row.phone);
    var phoneButton = phone
        ? '<a class="btn btn-secondary btn-sm" href="tel:' + escapeHtml(phone) + '">Call</a>'
        : '<button class="btn btn-secondary btn-sm" disabled>No phone</button>';
    var statusAction = row.delivered
        ? '<span class="ops-delivered-label">Delivered</span>'
        : '<button class="btn btn-primary btn-sm mark-delivered-button" data-order-id="' + escapeHtml(row.id) + '">Mark delivered</button>';

    return '<article class="delivery-stop ' + (row.delivered ? 'completed' : '') + '">'
        + '<div class="delivery-stop-number">' + escapeHtml(stopNumber) + '</div>'
        + '<div class="delivery-stop-body">'
        + '<div class="delivery-stop-heading"><div><h3>' + escapeHtml(row.customerName) + '</h3><p>' + escapeHtml(row.address) + '</p></div><strong>' + escapeHtml(formatCurrency(row.totalAmount)) + '</strong></div>'
        + '<div class="delivery-stop-meta"><span>' + escapeHtml(row.itemLines) + ' product lines</span><span>' + escapeHtml(row.unitCount) + ' units</span><span>' + escapeHtml(row.status) + '</span></div>'
        + '<details class="packing-details" ' + (row.delivered ? '' : 'open') + '><summary>Packing checklist</summary><div class="packing-list">' + renderPackingItems(row) + '</div></details>'
        + '<div class="ops-work-actions"><button class="btn btn-ghost btn-sm open-delivery-order" data-order-id="' + escapeHtml(row.id) + '">Open order</button>' + phoneButton + statusAction + '</div>'
        + '</div></article>';
}

async function loadDeliveryData(dateKey) {
    var results = await Promise.all([
        sessionDataStore.loadOrders({ source: 'delivery-workspace' }),
        customerService.getAllCustomers().catch(function() {
            return [];
        })
    ]);
    var orderResult = results[0] || {};
    return buildDeliveryRows(orderResult.records || [], results[1] || [], dateKey);
}

function attachDeliveryEvents(dateKey) {
    document.querySelectorAll('.open-delivery-order').forEach(function(button) {
        button.addEventListener('click', function() {
            router.navigate(ROUTES.ORDER_DETAIL.replace(':id', button.dataset.orderId));
        });
    });

    document.querySelectorAll('.packing-check input').forEach(function(input) {
        input.addEventListener('change', function() {
            var label = input.closest('.packing-check');
            if (label) {
                label.classList.toggle('checked', input.checked);
            }
        });
    });

    document.querySelectorAll('.mark-delivered-button').forEach(function(button) {
        button.addEventListener('click', async function() {
            var orderId = button.dataset.orderId;
            button.disabled = true;
            button.textContent = 'Saving...';
            try {
                await orderService.updateOrderStatus(orderId, 'fulfilled');
                sessionDataStore.updateOrderRecord(orderId, {
                    status: 'fulfilled',
                    fulfilledAt: new Date(),
                    updatedAt: new Date()
                }, 'delivery-mark-fulfilled');
                notificationService.success('Delivery completed.');
                await renderDeliveryWorkspace({ date: dateKey });
            } catch (error) {
                console.error('Could not complete delivery.', error);
                notificationService.error(error.message || 'Could not mark this delivery complete.');
                button.disabled = false;
                button.textContent = 'Mark delivered';
            }
        });
    });
}

export async function renderDeliveryWorkspace(params) {
    var safeParams = params || {};
    var dateKey = safeParams.date || getTodayKey();
    layoutView.render('route-change');
    layoutView.updateTitle('Delivery & Packing');
    var container = document.getElementById('page-container');
    container.innerHTML = '<section class="ops-page"><div class="ops-loading">Building today’s delivery run...</div></section>';

    var rows = await loadDeliveryData(dateKey);
    var summary = summarizeDeliveries(rows);
    container.innerHTML = '<section class="ops-page animate-fade-in">'
        + '<header class="ops-page-header"><div><span class="ops-eyebrow">Fulfillment</span><h1>Delivery and packing</h1><p>A driver-friendly run sheet with product checklists and delivery completion.</p></div>'
        + '<div class="ops-toolbar"><label for="delivery-date">Delivery date</label><input class="input" id="delivery-date" type="date" value="' + escapeHtml(dateKey) + '"><button class="btn btn-secondary" id="print-delivery-run">Print run</button></div></header>'
        + '<div class="ops-metric-grid">'
        + renderMetric('Stops', summary.stops, 'attention')
        + renderMetric('Ready to deliver', summary.ready, summary.ready > 0 ? 'warning' : 'calm')
        + renderMetric('Delivered', summary.delivered, 'calm')
        + renderMetric('Units packed', summary.units, 'attention')
        + '</div>'
        + '<section class="ops-panel"><div class="ops-panel-heading"><div><h2>Delivery run</h2><p>Check items while packing, then complete each stop.</p></div><span class="metric-pill">' + escapeHtml(dateKey) + '</span></div>'
        + '<div class="delivery-list">' + (rows.length ? rows.map(function(row, index) {
            return renderDeliveryRow(row, index + 1);
        }).join('') : '<div class="ops-empty">No confirmed deliveries are scheduled for this date.</div>') + '</div></section>'
        + '</section>';

    var dateInput = document.getElementById('delivery-date');
    if (dateInput) {
        dateInput.addEventListener('change', function() {
            renderDeliveryWorkspace({ date: dateInput.value });
        });
    }
    var printButton = document.getElementById('print-delivery-run');
    if (printButton) {
        printButton.addEventListener('click', function() {
            window.print();
        });
    }
    attachDeliveryEvents(dateKey);
}