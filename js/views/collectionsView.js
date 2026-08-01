import { layoutView } from "./layoutView.js";
import sessionDataStore from "../services/sessionDataStore.js";
import { customerService } from "../services/customerService.js";
import { orderService } from "../services/orderService.js";
import { notificationService } from "../core/notificationService.js";
import { formatCurrency, formatDate } from "../core/formatters.js";
import { buildCollectionRows, summarizeCollections } from "../services/operationsPlanningService.js";
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
    return String(value || '').replace(/[^\d]/g, '');
}

function getRiskLabel(row) {
    if (row.risk === 'critical') {
        return row.ageDays + ' days overdue';
    }
    if (row.risk === 'high') {
        return row.ageDays + ' days overdue';
    }
    if (row.risk === 'due') {
        return row.ageDays + ' day' + (row.ageDays === 1 ? '' : 's') + ' overdue';
    }
    if (row.dueInDays > 0) {
        return 'Due in ' + row.dueInDays + ' day' + (row.dueInDays === 1 ? '' : 's');
    }
    return 'Due today';
}

function buildReminderLink(row) {
    var phone = normalizePhone(row.phone);
    if (!phone) {
        return '';
    }

    var message = 'Hello ' + row.customerName + ', this is a friendly reminder that '
        + formatCurrency(row.amount) + ' remains outstanding for your Kyrgyz Organics order. '
        + 'Please let us know when we can expect payment. Thank you.';
    return 'https://wa.me/' + phone + '?text=' + encodeURIComponent(message);
}

async function loadCollectionsData() {
    var results = await Promise.all([
        sessionDataStore.loadOrders({ source: 'collections' }),
        customerService.getAllCustomers().catch(function() {
            return [];
        })
    ]);
    var orderResult = results[0] || {};
    return {
        orders: orderResult.records || [],
        customers: results[1] || []
    };
}

function renderMetric(label, value, tone) {
    return '<article class="ops-metric-card ' + escapeHtml(tone || '') + '">'
        + '<span>' + escapeHtml(label) + '</span>'
        + '<strong>' + escapeHtml(value) + '</strong>'
        + '</article>';
}

function renderCollectionRow(row) {
    var reminderLink = buildReminderLink(row);
    var customerButton = row.customerId
        ? '<button class="btn btn-ghost btn-sm collection-customer" data-customer-id="' + escapeHtml(row.customerId) + '">Open customer</button>'
        : '';
    var reminderButton = reminderLink
        ? '<a class="btn btn-secondary btn-sm" href="' + escapeHtml(reminderLink) + '" target="_blank" rel="noopener">WhatsApp reminder</a>'
        : '<button class="btn btn-secondary btn-sm" disabled title="Add a phone number to this customer">No phone saved</button>';

    return '<article class="ops-work-row" data-risk="' + escapeHtml(row.risk) + '">'
        + '<div class="ops-work-main">'
        + '<div class="ops-work-title"><strong>' + escapeHtml(row.customerName) + '</strong><span class="ops-risk-pill ' + escapeHtml(row.risk) + '">' + escapeHtml(getRiskLabel(row)) + '</span></div>'
        + '<div class="ops-work-meta">Order ' + escapeHtml(formatDate(row.orderDate)) + ' · Due ' + escapeHtml(formatDate(row.dueDate)) + ' · ' + escapeHtml(row.status) + '</div>'
        + '</div>'
        + '<div class="ops-work-amount">' + escapeHtml(formatCurrency(row.amount)) + '</div>'
        + '<div class="ops-work-actions">' + customerButton + reminderButton
        + '<button class="btn btn-primary btn-sm mark-paid-button" data-order-id="' + escapeHtml(row.id) + '">Mark paid</button></div>'
        + '</article>';
}

function attachCollectionEvents() {
    var customerButtons = document.querySelectorAll('.collection-customer');
    customerButtons.forEach(function(button) {
        button.addEventListener('click', function() {
            router.navigate(ROUTES.CUSTOMER_DETAIL.replace(':id', button.dataset.customerId));
        });
    });

    var paidButtons = document.querySelectorAll('.mark-paid-button');
    paidButtons.forEach(function(button) {
        button.addEventListener('click', async function() {
            var orderId = button.dataset.orderId;
            button.disabled = true;
            button.textContent = 'Saving...';
            try {
                await orderService.updateOrderStatus(orderId, 'paid');
                sessionDataStore.updateOrderRecord(orderId, {
                    status: 'paid',
                    paidAt: new Date(),
                    updatedAt: new Date()
                }, 'collections-mark-paid');
                notificationService.success('Payment recorded.');
                await renderCollections();
            } catch (error) {
                console.error('Could not mark collection paid.', error);
                notificationService.error(error.message || 'Could not record payment.');
                button.disabled = false;
                button.textContent = 'Mark paid';
            }
        });
    });
}

export async function renderCollections() {
    layoutView.render('route-change');
    layoutView.updateTitle('Payment Collections');
    var container = document.getElementById('page-container');
    container.innerHTML = '<section class="ops-page"><div class="ops-loading">Loading outstanding balances...</div></section>';

    var data = await loadCollectionsData();
    var rows = buildCollectionRows(data.orders, data.customers, new Date());
    var summary = summarizeCollections(rows);

    container.innerHTML = '<section class="ops-page animate-fade-in">'
        + '<header class="ops-page-header"><div><span class="ops-eyebrow">Receivables</span><h1>Payment collection center</h1><p>Prioritized follow-ups with customer contact details and one-tap payment completion.</p></div>'
        + '<button class="btn btn-secondary" id="collections-refresh">Refresh</button></header>'
        + '<div class="ops-metric-grid">'
        + renderMetric('Outstanding', formatCurrency(summary.outstanding), 'attention')
        + renderMetric('Overdue', formatCurrency(summary.overdue), 'warning')
        + renderMetric('Critical accounts', summary.critical, 'danger')
        + renderMetric('Customers to contact', summary.customers, 'calm')
        + '</div>'
        + '<section class="ops-panel"><div class="ops-panel-heading"><div><h2>Collection queue</h2><p>Oldest balances appear first.</p></div><span class="metric-pill">' + rows.length + ' open</span></div>'
        + '<div class="ops-work-list">' + (rows.length ? rows.map(renderCollectionRow).join('') : '<div class="ops-empty">Everything is collected. No outstanding balances need attention.</div>') + '</div></section>'
        + '</section>';

    var refreshButton = document.getElementById('collections-refresh');
    if (refreshButton) {
        refreshButton.addEventListener('click', function() {
            sessionDataStore.refreshOrders({ source: 'collections-refresh', forceRefresh: true }).finally(function() {
                renderCollections();
            });
        });
    }
    attachCollectionEvents();
}