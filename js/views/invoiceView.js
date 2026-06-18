import { layoutView } from "./layoutView.js";
import { invoiceController } from "../controllers/invoiceController.js";
import { LoadingSkeleton } from "../components/loadingSkeleton.js";
import { formatDate, formatCurrency } from "../core/formatters.js";
import { createCard } from "../components/card.js";
import { createStatusBadge } from "../components/statusBadge.js";
import { DataTable } from "../components/dataTable.js";
import { renderInvoiceSyncPill } from "../components/syncStatusBadge.js";
import { t, i18n } from "../core/i18n.js";

import { router } from "../router.js";
import { ROUTES } from "../core/constants.js";
import { productService } from "../services/productService.js";
import { qrActivityService } from "../services/qrActivityService.js";
import { qrService } from "../services/qrService.js";
import { buildGoogleSheetUrl, settingsService } from "../services/settingsService.js";
import { customerService } from "../services/customerService.js";
import { offlineStatusService } from "../services/offlineStatusService.js";
import { getDisplayStatus, getReturnState, isReturnFilterMatch } from "../core/returnStatus.js";
import {
    canEditInvoiceDate,
    canEditInvoiceItems,
    canFulfillInvoice,
    canRecordInvoiceReturn,
    getCanonicalInvoiceStatus,
    getInvoiceWorkflowLockMessage,
    isInvoiceReadOnly
} from "../core/invoiceWorkflow.js";

function escapeAttribute(value = '') {
    return escapeHtml(value).replace(/"/g, '&quot;');
}

function escapeHtml(value = '') {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function safeImageUrl(value = '') {
    const url = String(value || '').trim();
    if (!url) return '';
    if (/^(https?:|data:image\/|blob:)/i.test(url)) return escapeAttribute(url);
    return '';
}

function renderBankInfo(value = '') {
    return String(value || '')
        .split(/\n|<br\s*\/?>/i)
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => `<div style="margin-bottom: 2px;">&bull; ${escapeHtml(line)}</div>`)
        .join('');
}

function toDateInputValue(value) {
    const date = value?.toDate ? value.toDate() : new Date(value);
    const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
    return safeDate.toISOString().split('T')[0];
}

function toDisplayDate(value) {
    if (!value) return 'Pending timestamp';
    const date = value?.toDate ? value.toDate() : (value?.seconds ? new Date(value.seconds * 1000) : new Date(value));
    return Number.isNaN(date.getTime()) ? 'Pending timestamp' : date.toLocaleString();
}

function formatQrAction(action = '') {
    return String(action || 'qr_event')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, char => char.toUpperCase());
}

function renderQrActivityTimeline(activities = []) {
    const rows = activities.slice(0, 12).map(activity => {
        const successColor = activity.success === false ? '#b91c1c' : '#166534';
        const role = activity.role && activity.role !== 'unknown' ? activity.role : (activity.mode || 'QR');
        return `
            <div style="display: grid; grid-template-columns: 128px 1fr auto; gap: 12px; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--color-gray-100);">
                <div style="font-size: 11px; color: var(--color-gray-500); font-weight: 700;">${escapeHtml(toDisplayDate(activity.createdAt))}</div>
                <div>
                    <div style="font-size: 13px; font-weight: 900; color: var(--color-gray-900);">${escapeHtml(formatQrAction(activity.action))}</div>
                    <div style="font-size: 11px; color: var(--color-gray-500); margin-top: 2px;">${escapeHtml(role)}${activity.mode ? ` · ${escapeHtml(activity.mode)}` : ''}</div>
                </div>
                <span style="font-size: 11px; font-weight: 900; color: ${successColor};">${activity.success === false ? 'Failed' : 'OK'}</span>
            </div>
        `;
    }).join('');

    return `
        <div class="card qr-activity-timeline no-print" style="padding: 18px; margin: 0 auto 28px; width: min(920px, calc(100% - 32px));">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 10px;">
                <div>
                    <h3 style="font-size: 15px; font-weight: 900; margin: 0;">QR Activity Timeline</h3>
                    <div style="font-size: 12px; color: var(--color-gray-500); margin-top: 3px;">Latest QR opens, PIN attempts, returns, and WhatsApp handoffs.</div>
                </div>
                <span style="font-size: 12px; color: var(--color-gray-500); font-weight: 800;">${activities.length} event${activities.length === 1 ? '' : 's'}</span>
            </div>
            ${activities.length ? rows : `<div style="padding: 18px; color: var(--color-gray-500); font-size: 13px; background: var(--color-gray-50); border-radius: 10px;">No QR activity has been logged for this invoice yet.</div>`}
        </div>
    `;
}

function summarizeConflictVersion(version = {}) {
    return JSON.stringify({
        invoiceNumber: version.invoiceNumber || '',
        status: version.status || '',
        customerName: version.customerName || '',
        totalAmount: version.totalAmount || 0,
        returnRequested: version.returnRequested || false,
        returnItems: version.returnItems || [],
        updatedAt: toDisplayDate(version.updatedAt || version.localUpdatedAt)
    }, null, 2);
}

function renderConflictReview(conflict) {
    if (!conflict) {
        return '';
    }

    return `
        <section id="invoice-conflict-review" class="card no-print" style="margin: 16px auto; width: min(1100px, calc(100% - 32px)); border-color: #fecaca; background: #fff7f7;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 12px;">
                <div>
                    <h2 style="font-size: 16px; font-weight: 900; color: #991b1b; margin: 0;">Sync Conflict</h2>
                    <p style="font-size: 13px; color: #7f1d1d; margin: 4px 0 0;">This invoice changed on another device before the offline edit synced. Choose which version should win.</p>
                </div>
                <div style="display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end;">
                    <button class="btn btn-secondary btn-sm conflict-action" data-resolution="server">Choose Server</button>
                    <button class="btn btn-primary btn-sm conflict-action" data-resolution="local">Choose Local</button>
                    <button class="btn btn-secondary btn-sm conflict-action" data-resolution="manual">Manual Merge</button>
                </div>
            </div>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px;">
                <label style="display: grid; gap: 6px;">
                    <span style="font-size: 12px; font-weight: 900; color: #991b1b;">Server Version</span>
                    <pre style="white-space: pre-wrap; background: white; border: 1px solid #fecaca; border-radius: 8px; padding: 12px; font-size: 11px; max-height: 220px; overflow: auto;">${escapeHtml(summarizeConflictVersion(conflict.serverVersion))}</pre>
                </label>
                <label style="display: grid; gap: 6px;">
                    <span style="font-size: 12px; font-weight: 900; color: #991b1b;">Local Offline Version</span>
                    <pre style="white-space: pre-wrap; background: white; border: 1px solid #fecaca; border-radius: 8px; padding: 12px; font-size: 11px; max-height: 220px; overflow: auto;">${escapeHtml(summarizeConflictVersion(conflict.localVersion))}</pre>
                </label>
            </div>
        </section>
    `;
}

function renderApprovalResponseBanner(approvalLink) {
    if (!approvalLink || (approvalLink.status !== 'accepted' && approvalLink.status !== 'modified')) {
        return '';
    }

    const isAccepted = approvalLink.status === 'accepted';
    const changes = approvalLink.customerChanges || {};
    const modifiedItems = changes.modifiedItems || [];
    const borderColor = isAccepted ? '#bbf7d0' : '#fde68a';
    const backgroundColor = isAccepted ? '#f0fdf4' : '#fffbeb';
    const textColor = isAccepted ? '#166534' : '#92400e';
    const title = isAccepted ? 'Customer Accepted Order' : 'Customer Requested Changes';

    return `
        <section class="card no-print" style="margin: 16px auto; width: min(1100px, calc(100% - 32px)); border-color: ${borderColor}; background: ${backgroundColor};">
            <h2 style="font-size: 16px; font-weight: 900; color: ${textColor}; margin: 0 0 6px;">${title}</h2>
            <div style="font-size: 12px; color: ${textColor}; font-weight: 700;">Response date: ${escapeHtml(toDisplayDate(approvalLink.responseSubmittedAt))}</div>
            ${changes.notes ? `<p style="font-size: 13px; color: ${textColor}; margin: 10px 0 0;"><strong>Notes:</strong> ${escapeHtml(changes.notes)}</p>` : ''}
            ${modifiedItems.length ? `
                <div style="margin-top: 10px; display: grid; gap: 6px;">
                    ${modifiedItems.map(function(item) {
                        return `
                            <div style="display: flex; justify-content: space-between; gap: 12px; font-size: 13px; color: ${textColor}; background: rgba(255,255,255,0.65); border-radius: 8px; padding: 8px 10px;">
                                <span style="font-weight: 800;">${escapeHtml(item.name || item.productId || 'Product')}</span>
                                <span>${Number(item.originalQuantity) || 0} → ${Number(item.requestedQuantity) || 0}</span>
                            </div>
                        `;
                    }).join('')}
                </div>
            ` : ''}
        </section>
    `;
}

function renderCustomerApprovalSection(approvalLink) {
    const hasLink = !!approvalLink;
    const approvalUrl = hasLink ? invoiceController.buildApprovalUrl(approvalLink.token) : '';
    const displayStatus = invoiceController.getApprovalDisplayStatus(approvalLink);
    const responseStatus = approvalLink && approvalLink.responseType ? approvalLink.responseType : 'No response';

    return `
        <section id="customer-approval-panel" class="card customer-approval-panel customer-approval-card approval-link-panel no-print" style="padding: 18px; margin: 0 auto 28px; width: min(920px, calc(100% - 32px));">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 12px; flex-wrap: wrap;">
                <div>
                    <h3 style="font-size: 15px; font-weight: 900; margin: 0;">Customer Approval</h3>
                    <div style="font-size: 12px; color: var(--color-gray-500); margin-top: 3px;">Generate a time-limited customer review link for this invoice.</div>
                </div>
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                    <button id="btn-generate-approval-link" class="btn btn-primary btn-sm">Generate Approval Link</button>
                    <button id="btn-copy-approval-link" class="btn btn-secondary btn-sm" ${hasLink ? '' : 'disabled'}>Copy Link</button>
                </div>
            </div>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; margin-bottom: 12px;">
                <div style="background: var(--color-gray-50); border-radius: 8px; padding: 10px;">
                    <div style="font-size: 11px; font-weight: 900; color: var(--color-gray-500); text-transform: uppercase;">Link Status</div>
                    <div style="font-size: 13px; font-weight: 900; color: var(--color-gray-900); margin-top: 4px;">${escapeHtml(displayStatus)}</div>
                </div>
                <div style="background: var(--color-gray-50); border-radius: 8px; padding: 10px;">
                    <div style="font-size: 11px; font-weight: 900; color: var(--color-gray-500); text-transform: uppercase;">Expires</div>
                    <div style="font-size: 13px; font-weight: 900; color: var(--color-gray-900); margin-top: 4px;">${hasLink ? escapeHtml(toDisplayDate(approvalLink.expiresAt)) : '-'}</div>
                </div>
                <div style="background: var(--color-gray-50); border-radius: 8px; padding: 10px;">
                    <div style="font-size: 11px; font-weight: 900; color: var(--color-gray-500); text-transform: uppercase;">Customer Response Status</div>
                    <div style="font-size: 13px; font-weight: 900; color: var(--color-gray-900); margin-top: 4px;">${escapeHtml(responseStatus)}</div>
                </div>
            </div>
            ${hasLink ? `
                <label style="display: grid; gap: 6px;">
                    <span style="font-size: 12px; font-weight: 900; color: var(--color-gray-600);">Approval URL</span>
                    <input id="approval-link-url" class="input" readonly value="${escapeAttribute(approvalUrl)}" style="font-size: 12px;">
                </label>
            ` : ''}
        </section>
    `;
}

export const renderInvoices = async () => {
    layoutView.render();
    layoutView.updateTitle(t('invoice_title'));
    const container = document.getElementById('page-container');
    container.innerHTML = LoadingSkeleton();

    // Load Data
    let [allInvoices, allOrders, invoiceSettings] = await Promise.all([
        invoiceController.loadAllInvoices(),
        import("../services/orderService.js")
            .then(m => m.orderService.getAllOrders())
            .catch(error => {
                console.warn("Could not load orders for invoice print status.", error);
                return [];
            }),
        settingsService.getInvoiceSettings().catch(error => {
            console.warn("Could not load invoice settings for invoice list.", error);
            return {};
        })
    ]);
    const googleSheetUrl = buildGoogleSheetUrl(invoiceSettings.googleSheetId);

    const orderMap = {};
    allOrders.forEach(o => orderMap[o.id] = o);
    allInvoices.forEach(inv => {
        inv.isPrinted = (orderMap[inv.orderId] && orderMap[inv.orderId].isPrinted) || false;
    });

    let customers = [...new Set(allInvoices.map(i => i.customerName).filter(Boolean))].sort();

    let filtered = [...allInvoices];
    let sort = { key: 'createdAt', order: 'desc' };
    let filters = { customer: 'all', period: 'all', status: 'all' };
    let historyLimit = 50;
    let activeInvoiceTab = 'active';
    let archivedInvoices = [];
    let archivedLoaded = false;

    function renderInvoiceTabs() {
        return `
            <div style="display: flex; gap: 4px; background: var(--color-gray-50); padding: 4px; border-radius: 8px;">
                <button id="active-invoices-tab" class="invoice-tab-btn btn btn-sm ${activeInvoiceTab === 'active' ? 'btn-primary' : 'btn-ghost'}" data-tab="active" style="font-size: 11px; padding: 4px 10px;">Active Invoices</button>
                <button id="archived-invoices-tab" class="invoice-tab-btn btn btn-sm ${activeInvoiceTab === 'archived' ? 'btn-primary' : 'btn-ghost'}" data-tab="archived" style="font-size: 11px; padding: 4px 10px;">Archived Invoices</button>
            </div>
        `;
    }

    const applyInvoicesFilters = () => {
        if (activeInvoiceTab === 'archived') {
            renderArchivedTable();
            return;
        }

        filtered = allInvoices.filter(inv => {
            const matchesCustomer = filters.customer === 'all' || inv.customerName === filters.customer;
            const matchesStatus = filters.status === 'all' ? true :
                filters.status === 'returned' ? isReturnFilterMatch(inv, 'any_return') :
                ['returned', 'partially_returned', 'partial_return', 'fully_returned', 'any_return'].includes(filters.status)
                    ? isReturnFilterMatch(inv, filters.status)
                    : getCanonicalInvoiceStatus(inv.status) === getCanonicalInvoiceStatus(filters.status);

            const date = (inv.createdAt && inv.createdAt.toDate) ? inv.createdAt.toDate() : new Date(inv.createdAt);
            const now = new Date();
            let matchesPeriod = filters.period === 'all';
            if (filters.period === 'today') {
                matchesPeriod = date.getDate() === now.getDate() && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
            } else if (filters.period === 'week') {
                const startOfWeek = new Date(now);
                // Adjust to Monday as first day of week (common in Kyrgyzstan/Russia)
                startOfWeek.setDate(now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1));
                startOfWeek.setHours(0, 0, 0, 0);
                matchesPeriod = date >= startOfWeek;
            } else if (filters.period === 'month') {
                matchesPeriod = date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
            }

            return matchesCustomer && matchesStatus && matchesPeriod;
        });

        // Apply Sort
        filtered.sort((a, b) => {
            if (a.isPrinted !== b.isPrinted) {
                return a.isPrinted ? 1 : -1;
            }

            let valA = a[sort.key];
            let valB = b[sort.key];

            if (sort.key === 'createdAt') {
                valA = valA ? (valA.toDate ? valA.toDate() : new Date(valA)) : new Date(0);
                valB = valB ? (valB.toDate ? valB.toDate() : new Date(valB)) : new Date(0);
            }

            if (valA < valB) return sort.order === 'asc' ? -1 : 1;
            if (valA > valB) return sort.order === 'asc' ? 1 : -1;
            return 0;
        });

        renderTable();
    };

    window.handleTableSort = (key) => {
        if (sort.key === key) {
            sort.order = sort.order === 'asc' ? 'desc' : 'asc';
        } else {
            sort.key = key;
            sort.order = 'asc';
        }
        applyInvoicesFilters();
    };

    async function loadArchivedInvoices(forceRefresh) {
        if (!forceRefresh && archivedLoaded) {
            return archivedInvoices;
        }
        archivedInvoices = await invoiceController.loadArchivedInvoices();
        archivedLoaded = true;
        return archivedInvoices;
    }

    function attachInvoiceTabListeners() {
        document.querySelectorAll('.invoice-tab-btn').forEach(function(button) {
            button.addEventListener('click', async function() {
                activeInvoiceTab = button.dataset.tab || 'active';
                if (activeInvoiceTab === 'archived') {
                    container.innerHTML = LoadingSkeleton();
                    await loadArchivedInvoices(false);
                    renderArchivedTable();
                    return;
                }
                applyInvoicesFilters();
            });
        });
    }

    function attachArchivedRowListeners() {
        container.querySelectorAll('.data-row').forEach(function(row) {
            row.addEventListener('click', function() {
                const id = row.dataset.id;
                router.navigate(ROUTES.INVOICE_DETAIL.replace(':id', id));
            });
        });
    }

    function renderArchivedTable() {
        const archivedTable = new DataTable({
            columns: [
                { key: 'invoiceNumber', label: t('table_invoice_num'), sortable: false, render: function(val) { return `<span style="font-family: monospace; font-weight: 700; color: #1e3318;">${escapeHtml(val || '-')}</span>`; } },
                { key: 'customerName', label: 'Customer', sortable: false, render: function(val) { return `<span style="font-weight: 700;">${escapeHtml(val || '-')}</span>`; } },
                { key: 'totalAmount', label: 'Amount', sortable: false, render: function(val) { return `<span style="font-weight: 700; color: #1e3318;">${formatCurrency(val || 0)}</span>`; } },
                { key: 'archivedAt', label: 'Archived At', sortable: false, render: function(val) { return `<span style="color: #5a7052;">${escapeHtml(toDisplayDate(val))}</span>`; } },
                { key: 'archivedBy', label: 'Archived By', sortable: false, render: function(val) { return `<span>${escapeHtml(val || '-')}</span>`; } }
            ],
            data: archivedInvoices,
            sortKey: 'archivedAt',
            sortOrder: 'desc',
            onRowClick: true,
            sortHandlerName: 'handleArchivedInvoiceSort',
            actions: function(row) {
                return `
                    <div style="display: flex; gap: 4px; justify-content: flex-end;">
                        <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); window.viewInvoice('${row.id}')">
                            ${t('btn_view') || 'View'}
                        </button>
                        <button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); window.restoreArchivedInvoice('${row.id}')">
                            Restore
                        </button>
                    </div>
                `;
            }
        });

        container.innerHTML = `
            <div class="animate-fade-in" style="display: flex; flex-direction: column; gap: var(--space-4);">
                <div style="display: flex; justify-content: space-between; align-items: center; background: white; padding: 12px 16px; border-radius: var(--radius-lg); border: 1px solid var(--color-gray-200); gap: 12px; flex-wrap: wrap;">
                    <div style="display: flex; gap: var(--space-4); align-items: center; flex-wrap: wrap;">
                        ${renderInvoiceTabs()}
                    </div>
                    <button id="refresh-archived-invoices" class="btn btn-secondary btn-sm" style="white-space: nowrap;">
                        Refresh
                    </button>
                </div>

                ${createCard({
                    title: 'Archived Invoices',
                    content: archivedTable.render()
                })}
            </div>
        `;

        attachInvoiceTabListeners();
        attachArchivedRowListeners();

        const refreshArchivedButton = document.getElementById('refresh-archived-invoices');
        if (refreshArchivedButton) {
            refreshArchivedButton.addEventListener('click', async function() {
                refreshArchivedButton.disabled = true;
                refreshArchivedButton.textContent = 'Loading...';
                await loadArchivedInvoices(true);
                renderArchivedTable();
            });
        }
    }

    const renderTable = () => {
        const table = new DataTable({
            columns: [
                { key: 'invoiceNumber', label: t('table_invoice_num'), render: (val) => `<span style="font-family: monospace; font-weight: 700; color: #1e3318;">${val}</span>` },
                {
                    key: 'customerName', label: 'Customer', render: (val, row) => `
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                        <span style="font-weight: 700; color: ${row.isPrinted ? '#10b981' : '#ef4444'};">${val}</span>
                        <div style="display: flex; gap: 4px; align-items: center;">
                            <button class="btn-icon" onclick="event.stopPropagation(); window.playClickAnimation(event, 'print'); window.viewInvoice('${row.id}')" title="Print Invoice" style="color: ${row.isPrinted ? '#10b981' : '#ef4444'}; background: transparent; padding: 2px;">
                                🖨️
                            </button>
                        </div>
                    </div>
                ` },
                { key: 'createdAt', label: 'Date', render: (val) => `<span style="color: #5a7052;">${formatDate((val && val.toDate) ? val.toDate() : val)}</span>` },
                { key: 'totalAmount', label: 'Amount', render: (val) => `<span style="font-weight: 700; color: #1e3318;">${formatCurrency(val || 0)}</span>` },
                { key: 'status', label: 'Status', align: 'center', render: (val, row) => createStatusBadge(row) },
                { key: 'syncState', label: 'Sync', align: 'center', render: (val, row) => renderInvoiceSyncPill(row) },
            ],
            data: filtered,
            sortKey: sort.key,
            sortOrder: sort.order,
            onRowClick: true,
            mobileCard: (row) => `
                <div style="display: grid; gap: 10px;">
                    <div style="display: flex; justify-content: space-between; gap: 10px; align-items: flex-start;">
                        <span style="min-width: 0;">
                            <strong style="display: block; color: var(--color-gray-900); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(row.customerName || 'Customer')}</strong>
                            <small style="color: var(--color-gray-500); font-family: monospace;">${escapeHtml(row.invoiceNumber || row.id || '-')}</small>
                        </span>
                        ${createStatusBadge(row)}
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; font-size: 12px;">
                        <div><span style="display: block; color: var(--color-gray-500);">Amount</span><strong>${formatCurrency(row.totalAmount || 0)}</strong></div>
                        <div><span style="display: block; color: var(--color-gray-500);">Date</span><strong>${formatDate((row.createdAt && row.createdAt.toDate) ? row.createdAt.toDate() : row.createdAt)}</strong></div>
                        <div><span style="display: block; color: var(--color-gray-500);">Print</span><strong>${row.isPrinted ? 'Printed' : 'Needed'}</strong></div>
                    </div>
                    <div style="display: flex; gap: 6px; justify-content: flex-end; align-items: center;">
                        ${renderInvoiceSyncPill(row)}
                        <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); window.playClickAnimation(event, 'print'); window.viewInvoice('${row.id}')">${t('btn_view') || 'View'}</button>
                        <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); window.archiveInvoice('${row.id}')">Archive</button>
                    </div>
                </div>
            `,
            actions: (row) => `
                <div style="display: flex; gap: 4px;">
                    <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); window.playClickAnimation(event, 'print'); window.viewInvoice('${row.id}')">
                        ${t('btn_view') || 'View'}
                    </button>
                    <button class="btn btn-secondary btn-sm" style="padding: 4px 8px; font-size: 10px;" onclick="event.stopPropagation(); window.archiveInvoice('${row.id}')">
                        Archive
                    </button>
                </div>
            `
        });

        container.innerHTML = `
            <div class="animate-fade-in" style="display: flex; flex-direction: column; gap: var(--space-4);">
                <div style="display: flex; justify-content: space-between; align-items: center; background: white; padding: 12px 16px; border-radius: var(--radius-lg); border: 1px solid var(--color-gray-200); gap: 12px; flex-wrap: wrap;">
                    <div style="display: flex; gap: var(--space-4); align-items: center; flex-wrap: wrap;">
                        ${renderInvoiceTabs()}
                        <div style="height: 20px; width: 1px; background: var(--color-gray-200);"></div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <label style="font-size: 12px; font-weight: 600; color: var(--color-gray-500);">Customer:</label>
                            <select id="filter-customer" style="padding: 4px 8px; border-radius: 6px; border: 1px solid var(--color-gray-200); font-size: 13px;">
                                <option value="all">${t('invoice_all_customers')}</option>
                                ${customers.map(c => `<option value="${escapeAttribute(c)}" ${filters.customer === c ? 'selected' : ''}>${escapeAttribute(c)}</option>`).join('')}
                            </select>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <label style="font-size: 12px; font-weight: 600; color: var(--color-gray-500);">Status:</label>
                            <select id="filter-invoice-status" style="padding: 4px 8px; border-radius: 6px; border: 1px solid var(--color-gray-200); font-size: 13px;">
                                <option value="all" ${filters.status === 'all' ? 'selected' : ''}>All Statuses</option>
                                <option value="returned" ${filters.status === 'returned' ? 'selected' : ''}>Returned</option>
                                <option value="draft" ${filters.status === 'draft' ? 'selected' : ''}>Draft</option>
                                <option value="submitted" ${filters.status === 'submitted' ? 'selected' : ''}>Submitted</option>
                                <option value="pending" ${filters.status === 'pending' ? 'selected' : ''}>Pending</option>
                                <option value="approved" ${filters.status === 'approved' ? 'selected' : ''}>Approved</option>
                                <option value="confirmed" ${filters.status === 'confirmed' ? 'selected' : ''}>Confirmed</option>
                                <option value="fulfilled" ${filters.status === 'fulfilled' ? 'selected' : ''}>Fulfilled</option>
                                <option value="completed" ${filters.status === 'completed' ? 'selected' : ''}>Completed</option>
                            </select>
                        </div>
                        <div style="height: 20px; width: 1px; background: var(--color-gray-200);"></div>
                        <div style="display: flex; gap: 4px; background: var(--color-gray-50); padding: 4px; border-radius: 8px;">
                            <button class="period-btn btn btn-sm ${filters.period === 'today' ? 'btn-primary' : 'btn-ghost'}" data-period="today" style="font-size: 11px; padding: 4px 10px;">${t('invoice_today')}</button>
                            <button class="period-btn btn btn-sm ${filters.period === 'week' ? 'btn-primary' : 'btn-ghost'}" data-period="week" style="font-size: 11px; padding: 4px 10px;">${t('invoice_this_week')}</button>
                            <button class="period-btn btn btn-sm ${filters.period === 'month' ? 'btn-primary' : 'btn-ghost'}" data-period="month" style="font-size: 11px; padding: 4px 10px;">${t('invoice_this_month')}</button>
                            <button class="period-btn btn btn-sm ${filters.period === 'all' ? 'btn-primary' : 'btn-ghost'}" data-period="all" style="font-size: 11px; padding: 4px 10px;">${t('invoice_all_time')}</button>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end;">
                        <button id="load-more-invoice-history" class="btn btn-secondary btn-sm" style="white-space: nowrap;">
                            Load More History
                        </button>
                        ${googleSheetUrl ? `
                            <a href="${googleSheetUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm" style="white-space: nowrap; text-decoration: none;">
                                Open Google Sheet
                            </a>
                        ` : ''}
                    </div>
                </div>

                ${createCard({
            title: t('invoice_title') + ' · working set',
            content: table.render()
        })}
            </div>
        `;

        attachInvoiceTabListeners();

        // Row Click Listeners
        container.querySelectorAll('.data-row').forEach(row => {
            row.addEventListener('click', () => {
                const id = row.dataset.id;
                router.navigate(ROUTES.INVOICE_DETAIL.replace(':id', id));
            });
        });



        // Process Post-Print Highlight Animation if redirected
        if (window.highlightOrderId) {
            setTimeout(() => {
                const highlightedInvoice = filtered.find(inv => inv.orderId === window.highlightOrderId);
                if (highlightedInvoice) {
                    const row = document.querySelector(`tr[data-id="${highlightedInvoice.id}"]`);
                    if (row) {
                        row.classList.add('row-success-anim');
                        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        // Remove class after animation finishes so it can re-trigger if needed
                        setTimeout(() => row.classList.remove('row-success-anim'), 3000); // 3s matches the CSS
                    }
                }
                // Clear the flag so it doesn't fire again on normal navigation
                delete window.highlightOrderId;
            }, 100); // small delay to ensure DOM paint attached
        }

        // Event Listeners for filters
        document.getElementById('filter-customer').addEventListener('change', (e) => {
            filters.customer = e.target.value;
            applyInvoicesFilters();
        });

        document.getElementById('filter-invoice-status')?.addEventListener('change', (e) => {
            filters.status = e.target.value;
            applyInvoicesFilters();
        });

        document.querySelectorAll('.period-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                filters.period = btn.dataset.period;
                applyInvoicesFilters();
            });
        });

        const loadMoreHistoryButton = document.getElementById('load-more-invoice-history');
        if (loadMoreHistoryButton) {
            loadMoreHistoryButton.addEventListener('click', async function() {
                loadMoreHistoryButton.disabled = true;
                loadMoreHistoryButton.textContent = 'Loading...';
                historyLimit += 50;
                allInvoices = await invoiceController.loadInvoiceHistoryPage(historyLimit);
                customers = [...new Set(allInvoices.map(function(invoiceRow) {
                    return invoiceRow.customerName;
                }).filter(Boolean))].sort();
                applyInvoicesFilters();
            });
        }
    };

    // Initial Render
    applyInvoicesFilters();

    // Global Action Helper
    window.viewInvoice = (id) => router.navigate(ROUTES.INVOICE_DETAIL.replace(':id', id));

    window.restoreArchivedInvoice = function(id) {
        import("../components/modal.js").then(function(module) {
            module.Modal.confirm(
                'Restore Invoice?',
                'Restore this invoice? This will move it back to its previous status.',
                async function() {
                    const restored = await invoiceController.restoreArchivedInvoice(id);
                    if (restored) {
                        allInvoices = await invoiceController.loadAllInvoices();
                        customers = [...new Set(allInvoices.map(function(invoiceRow) {
                            return invoiceRow.customerName;
                        }).filter(Boolean))].sort();
                        await loadArchivedInvoices(true);
                        renderArchivedTable();
                    }
                }
            );
        });
    };

    window.toggleInvoicePrinted = async (orderId, isPrintedState) => {
        const { orderService } = await import("../services/orderService.js");
        if (orderId) {
            await orderService.updateOrder(orderId, { isPrinted: isPrintedState });
            renderInvoices();
        }
    };

    window.archiveInvoice = function(id) {
        import("../components/modal.js").then(function(module) {
            module.Modal.confirm(
                'Archive Invoice?',
                'Archive this invoice? It will move to Archived Invoices and can be restored later.',
                async function() {
                    const archived = await invoiceController.archiveInvoice(id);
                    if (archived) {
                        renderInvoices();
                    }
                }
            );
        });
    };
};



export const renderInvoiceDetail = async ({ id }) => {
    layoutView.render();

    const container = document.getElementById('page-container');
    container.innerHTML = LoadingSkeleton();

    let invoice, allProducts, liveSettings;
    try {
        [invoice, allProducts, liveSettings] = await Promise.all([
            invoiceController.loadInvoice(id),
            productService.getAllProducts().catch(error => {
                console.warn("Could not load live products for invoice print names.", error);
                return [];
            }),
            import("../services/settingsService.js")
                .then(m => m.settingsService.getInvoiceSettings())
                .catch(error => {
                    console.warn("Could not load live invoice settings for print.", error);
                    return { __fromFallback: true };
                })
        ]);
    } catch (e) {
        console.error("error fetching invoice deps", e);
        container.innerHTML = `<div class="p-8 text-center" style="color: #ef4444; font-weight: 500;">An error occurred while loading this invoice.</div>`;
        return;
    }

    if (!invoice) {
        container.innerHTML = `<div class="p-8 text-center">Invoice not found</div>`;
        return;
    }

    const openConflict = await import("../services/conflictService.js")
        .then(function(module) {
            return module.conflictService.getOpenConflictByEntityId(invoice.id);
        })
        .catch(function(error) {
            console.warn("Could not load invoice conflict state.", error);
            return null;
        });

    const qrActivities = await qrActivityService.getByInvoiceId(invoice.id).catch(error => {
        console.warn("Could not load QR activity for invoice.", error);
        return [];
    });
    let approvalLink = await invoiceController.loadApprovalLink(invoice.id);

    if (!/^1\d{5}$/.test(String(invoice.customerPinCode || ''))) {
        const customer = await customerService.getCustomerByName(invoice.customerName).catch(() => null);
        if (customer?.pinCode) {
            invoice.customerPinCode = customer.pinCode;
        }
    }
    if (invoice.returnRequested && invoice.orderId) {
        await import("../services/returnsService.js")
            .then(m => m.returnsService.syncInvoiceReturnToOrder(invoice))
            .catch(error => console.warn('Return mirror sync skipped while loading invoice.', error));
    }
    if (offlineStatusService.isOnline()) {
        invoice = await qrService.ensureInvoiceToken(invoice).catch(error => {
            console.warn("Could not publish invoice QR snapshot while rendering print view.", error);
            return invoice;
        });
    }

    // (liveSettings fetched unconditionally to always overwrite visibility flags)

    let currentLang = 'ru';
    let currentPage = 1;
    let invoiceScale = 1.0;
    let is2UpMode = false;

    const DEFAULT_ITEMS_PER_PAGE = 7;
    const getEditableItems = () => invoiceController
        .normalizeInvoiceItemsForEditing(invoice)
        .map(item => normalizeInvoiceItemReturnFields(item, invoice));
    const isDraftEditable = () => canEditInvoiceItems(invoice);
    const isInvoiceItemsEditable = () => {
        return canEditInvoiceItems(invoice);
    };
    const invoiceStatusOptions = [
        { value: 'draft', label: 'Draft' },
        { value: 'submitted', label: 'Submitted' },
        { value: 'approved', label: 'Approved' },
        { value: 'fulfilled', label: 'Fulfilled' },
        { value: 'partially_returned', label: 'Partially Returned' },
        { value: 'returned', label: 'Returned' }
    ];

    const getItemDisplayName = item => item.displayName || item.name || item.name_en || item.name_ru || item.name_kg || item.productName || 'Product';
    const safeNumber = (value, fallback = 0) => {
        const number = Number(value);
        return Number.isFinite(number) ? number : fallback;
    };

    function getReturnQuantityFromRecordItem(item = {}) {
        if (item.returnedQuantity !== undefined) {
            return safeNumber(item.returnedQuantity, 0);
        }
        if (item.returnQuantity !== undefined) {
            return safeNumber(item.returnQuantity, 0);
        }
        return safeNumber(item.quantity, 0);
    }

    function isMatchingReturnItem(returnItem = {}, invoiceItem = {}) {
        const returnLineItemId = returnItem.lineItemId || '';
        const itemLineItemId = invoiceItem.lineItemId || '';
        const returnProductId = returnItem.productId || returnItem.id || '';
        const itemProductId = invoiceItem.productId || invoiceItem.id || '';

        return (returnLineItemId && itemLineItemId && returnLineItemId === itemLineItemId)
            || (returnProductId && itemProductId && returnProductId === itemProductId);
    }

    function sumMatchingReturnItems(returnItems = [], invoiceItem = {}) {
        return (Array.isArray(returnItems) ? returnItems : []).reduce((sum, returnItem) => {
            if (!isMatchingReturnItem(returnItem, invoiceItem)) {
                return sum;
            }
            return sum + getReturnQuantityFromRecordItem(returnItem);
        }, 0);
    }

    function getInvoiceRecordedReturnQuantity(sourceInvoice = {}, invoiceItem = {}) {
        const returnItemsTotal = sumMatchingReturnItems(sourceInvoice.returnItems || [], invoiceItem);
        const returnRecordTotal = (Array.isArray(sourceInvoice.returns) ? sourceInvoice.returns : []).reduce((sum, returnRecord) => {
            return sum + sumMatchingReturnItems(returnRecord.items || returnRecord.returnItems || [], invoiceItem);
        }, 0);
        const courierReturnTotal = (Array.isArray(sourceInvoice.courierReturns) ? sourceInvoice.courierReturns : []).reduce((sum, returnRecord) => {
            return sum + sumMatchingReturnItems(returnRecord.items || returnRecord.returnItems || [], invoiceItem);
        }, 0);

        return Math.max(returnItemsTotal, returnRecordTotal, courierReturnTotal);
    }

    function getItemReturnedQuantity(item = {}, sourceInvoice = null) {
        const directReturnedQuantity = Math.max(
            safeNumber(item.returnedQuantity, 0),
            safeNumber(item.returnQuantity, 0)
        );
        const recordedReturnedQuantity = sourceInvoice ? getInvoiceRecordedReturnQuantity(sourceInvoice, item) : 0;
        return Math.max(0, directReturnedQuantity, recordedReturnedQuantity);
    }

    function getItemOriginalQuantity(item = {}) {
        return safeNumber(item.quantity !== undefined ? item.quantity : item.adjustedQuantity, 0);
    }

    function getItemRemainingQuantity(item = {}, sourceInvoice = null) {
        return Math.max(0, getItemOriginalQuantity(item) - getItemReturnedQuantity(item, sourceInvoice));
    }

    function getItemOriginalTotal(item = {}) {
        if (item.total !== undefined) {
            return safeNumber(item.total, 0);
        }
        return safeNumber(item.price, 0) * getItemOriginalQuantity(item);
    }

    function getItemAdjustedTotal(item = {}, sourceInvoice = null) {
        if (!sourceInvoice && item.adjustedTotal !== undefined) {
            return safeNumber(item.adjustedTotal, 0);
        }
        return safeNumber(item.price, 0) * getItemRemainingQuantity(item, sourceInvoice);
    }

    function normalizeInvoiceItemReturnFields(item = {}, sourceInvoice = null) {
        const returnedQuantity = getItemReturnedQuantity(item, sourceInvoice);
        const remainingQuantity = getItemRemainingQuantity(item, sourceInvoice);
        return Object.assign({}, item, {
            returnedQuantity,
            remainingQuantity,
            adjustedTotal: getItemAdjustedTotal(item, sourceInvoice)
        });
    }

    function hasInvoiceReturns(sourceInvoice = {}) {
        const summaryQuantity = safeNumber(sourceInvoice.returnSummary?.totalReturnedQuantity, 0);
        const hasReturnRecords = Array.isArray(sourceInvoice.returns) && sourceInvoice.returns.length > 0;
        const hasReturnedItems = (sourceInvoice.items || []).some(item => getItemReturnedQuantity(item, sourceInvoice) > 0);
        return summaryQuantity > 0 || hasReturnRecords || hasReturnedItems;
    }

    function calculateInvoiceReturnSummary(sourceInvoice = {}) {
        const items = (sourceInvoice.items || []).map(item => normalizeInvoiceItemReturnFields(item, sourceInvoice));
        const itemReturnedAmount = items.reduce((sum, item) => sum + (safeNumber(item.price, 0) * getItemReturnedQuantity(item)), 0);
        const summary = sourceInvoice.returnSummary || {};
        const totalReturnedQuantity = safeNumber(summary.totalReturnedQuantity, items.reduce((sum, item) => sum + getItemReturnedQuantity(item), 0));
        const totalReturnedAmount = safeNumber(summary.totalReturnedAmount, itemReturnedAmount);
        const originalTotalAmount = safeNumber(summary.originalTotalAmount, safeNumber(sourceInvoice.totalAmount, items.reduce((sum, item) => sum + getItemOriginalTotal(item), 0)));
        const adjustedTotalAmount = Math.max(0, originalTotalAmount - totalReturnedAmount);

        return {
            totalReturnedQuantity,
            totalReturnedAmount,
            originalTotalAmount,
            adjustedTotalAmount
        };
    }

    function renderInvoiceReturnBadge(item, lang) {
        const returnedQuantity = getItemReturnedQuantity(item);
        if (returnedQuantity <= 0) {
            return '';
        }

        const label = lang === 'en' ? 'RETURNED' : 'ВОЗВРАТ';
        const unit = lang === 'en' ? 'pcs' : 'шт';
        return `<div class="invoice-return-badge" style="display: inline-block; margin-top: 3px; padding: 2px 6px; border-radius: 4px; background: #fee2e2; color: #991b1b; font-size: 8px; font-weight: 900; letter-spacing: 0.04em;">${label}: ${returnedQuantity} ${unit}</div>`;
    }

    function renderInvoiceTotalsWithReturns(sourceInvoice, lang) {
        const summary = calculateInvoiceReturnSummary(sourceInvoice);
        const labels = lang === 'en'
            ? { adjusted: 'Total after return', original: 'Original total', returned: 'Total returned' }
            : { adjusted: 'Итого после возврата', original: 'Общая сумма до возврата', returned: 'Всего возвращено' };

        return `
            <div class="invoice-return-summary" style="width: 320px;">
                <div style="display: flex; justify-content: space-between; padding: 6px 12px; border-bottom: 1px solid #e2e8e0;">
                    <span class="invoice-total-original" style="color: #7f1d1d; font-size: 11px; font-weight: 700;">${labels.original}</span>
                    <span style="color: #7f1d1d; font-size: 11px; text-decoration: line-through;">${formatCurrency(summary.originalTotalAmount)}</span>
                </div>
                <div style="display: flex; justify-content: space-between; padding: 6px 12px; border-bottom: 1px solid #fee2e2;">
                    <span class="invoice-total-returned" style="color: #991b1b; font-size: 11px; font-weight: 800;">${labels.returned}</span>
                    <span style="color: #991b1b; font-size: 11px; font-weight: 900;">-${formatCurrency(summary.totalReturnedAmount)}</span>
                </div>
                <div class="invoice-total-adjusted" style="margin-top: 10px; background: #2e4a23; color: #fff; padding: 12px; border-radius: 4px; display: flex; justify-content: space-between; align-items: baseline;">
                    <span style="font-size: 10px; font-weight: 800; text-transform: uppercase;">${labels.adjusted}</span>
                    <span style="font-size: 20px; font-weight: 900;">${formatCurrency(summary.adjustedTotalAmount)}</span>
                </div>
            </div>
        `;
    }

    function renderInvoiceReturnDetails(sourceInvoice, lang) {
        const returns = Array.isArray(sourceInvoice.returns) ? sourceInvoice.returns : [];
        if (!returns.length) {
            return '';
        }

        const title = lang === 'en' ? 'Return details' : 'Детали возврата';
        const returnedByLabel = lang === 'en' ? 'Processed by' : 'Обработал';
        const amountLabel = lang === 'en' ? 'Returned amount' : 'Сумма возврата';
        const reasonLabel = lang === 'en' ? 'Reason' : 'Причина';
        const noteLabel = lang === 'en' ? 'Note' : 'Примечание';

        return `
            <div class="invoice-return-details" style="border: 1px solid #fecaca; background: #fff7f7; border-radius: 8px; padding: 10px 12px; margin-bottom: 18px; page-break-inside: avoid;">
                <div style="font-size: 10px; font-weight: 900; color: #991b1b; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 8px;">${title}</div>
                <div style="display: grid; gap: 6px;">
                    ${returns.map(returnRecord => `
                        <div style="display: grid; grid-template-columns: 95px 1fr auto; gap: 8px; align-items: start; font-size: 10px; color: #7f1d1d; border-top: 1px solid #fee2e2; padding-top: 6px;">
                            <span style="font-weight: 800;">${escapeHtml(toDisplayDate(returnRecord.createdAt))}</span>
                            <span>
                                ${returnRecord.createdBy ? `<strong>${returnedByLabel}:</strong> ${escapeHtml(returnRecord.createdBy)}<br>` : ''}
                                ${returnRecord.reason ? `<strong>${reasonLabel}:</strong> ${escapeHtml(returnRecord.reason)}<br>` : ''}
                                ${returnRecord.note ? `<strong>${noteLabel}:</strong> ${escapeHtml(returnRecord.note)}` : ''}
                            </span>
                            <span style="font-weight: 900;">${amountLabel}: ${formatCurrency(returnRecord.totalReturnedAmount || 0)}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    function renderInvoiceStatusControl() {
        const currentStatus = getCanonicalInvoiceStatus(invoice.status || 'draft');
        const returnState = getReturnState(invoice);
        const options = invoiceStatusOptions;
        const selectedStatus = returnState === 'partial'
            ? 'partially_returned'
            : (returnState === 'full' ? 'returned' : currentStatus);
        const disabledAttribute = isInvoiceReadOnly(invoice) ? 'disabled' : '';

        return `
            <div style="display: flex; align-items: center; gap: 8px; border-left: 1px solid var(--color-gray-200); padding-left: 15px;">
                <span style="font-size: 12px; font-weight: 600;">Status:</span>
                <select id="invoice-status-selector" class="input" ${disabledAttribute} style="height: 32px; padding: 2px 8px; font-size: 12px; width: 170px;">
                    ${options.map(option => `
                        <option value="${option.value}" ${selectedStatus === option.value ? 'selected' : ''}>${option.label}</option>
                    `).join('')}
                </select>
            </div>
        `;
    }

    function renderInvoiceLifecycle() {
        const currentStatus = getCanonicalInvoiceStatus(invoice.status || 'draft');
        const returnState = getReturnState(invoice);
        const hasApprovalResponse = approvalLink && ['accepted', 'modified'].includes(approvalLink.status);
        const isPrinted = Boolean(invoice.isPrinted || invoice.printedAt || invoice.printed === true);
        const isReturned = returnState === 'partial' || returnState === 'full' || ['returned', 'partially_returned', 'fully_returned'].includes(currentStatus);
        const isFulfilled = ['fulfilled', 'fullfilled'].includes(currentStatus) || isReturned;
        const isApproved = ['approved', 'fulfilled', 'fullfilled', 'returned', 'partially_returned', 'fully_returned'].includes(currentStatus) || hasApprovalResponse;
        const isSubmitted = currentStatus !== 'draft' || Boolean(approvalLink);

        const steps = [
            { key: 'draft', label: 'Draft', hint: 'Invoice created', done: true },
            { key: 'submitted', label: 'Submitted', hint: approvalLink ? 'Review link ready' : 'Ready to send', done: isSubmitted },
            { key: 'approved', label: 'Approved', hint: hasApprovalResponse ? 'Customer responded' : 'Awaiting approval', done: isApproved },
            { key: 'printed', label: 'Printed', hint: isPrinted ? 'Copy printed' : 'Print when ready', done: isPrinted },
            { key: 'fulfilled', label: 'Fulfilled', hint: isFulfilled ? 'Delivery complete' : 'Waiting delivery', done: isFulfilled },
            { key: 'closed', label: 'Closed', hint: isReturned ? 'Return recorded' : 'Paid or archived', done: isReturned || currentStatus === 'paid' }
        ];

        const firstOpenIndex = steps.findIndex(step => !step.done);
        const currentIndex = firstOpenIndex === -1 ? steps.length - 1 : firstOpenIndex;
        const nextAction = firstOpenIndex === -1
            ? 'Invoice is ready for cleanup or archive.'
            : steps[firstOpenIndex].hint;

        return `
            <section class="invoice-lifecycle no-print">
                <div style="display: flex; justify-content: space-between; gap: 12px; align-items: center; flex-wrap: wrap;">
                    <div>
                        <div style="font-size: 12px; font-weight: 900; color: var(--color-gray-900);">Invoice Lifecycle</div>
                        <div style="font-size: 11px; color: var(--color-gray-500); margin-top: 2px;">Next: ${escapeHtml(nextAction)}</div>
                    </div>
                    <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                        ${approvalLink ? `<span style="font-size: 11px; font-weight: 900; color: var(--color-primary-700); background: var(--color-primary-50); border: 1px solid var(--color-primary-100); border-radius: 999px; padding: 5px 9px;">Approval: ${escapeHtml(invoiceController.getApprovalDisplayStatus(approvalLink))}</span>` : ''}
                        ${isReturned ? `<span style="font-size: 11px; font-weight: 900; color: #991b1b; background: #fee2e2; border-radius: 999px; padding: 5px 9px;">Return active</span>` : ''}
                    </div>
                </div>
                <div class="invoice-lifecycle-track">
                    ${steps.map((step, index) => `
                        <div class="invoice-lifecycle-step ${step.done ? 'done' : ''} ${index === currentIndex ? 'current' : ''}">
                            <span class="invoice-lifecycle-label">${step.done ? '✓ ' : ''}${escapeHtml(step.label)}</span>
                            <span class="invoice-lifecycle-hint">${escapeHtml(step.hint)}</span>
                        </div>
                    `).join('')}
                </div>
            </section>
        `;
    }

    function renderDraftItemEditor() {
        return '';
    }

    function renderProductSelectorContent(products) {
        return `
            <div style="display: grid; gap: 12px;">
                <input id="draft-product-search" class="input" type="search" placeholder="Search products..." style="height: 38px;">
                <div id="draft-product-list" style="display: grid; gap: 8px; max-height: 56vh; overflow: auto;">
                    ${renderProductOptions(products)}
                </div>
                ${products.length ? '' : '<div style="padding: 18px; color: var(--color-gray-500); font-size: 13px; background: var(--color-gray-50); border-radius: 8px;">No products available.</div>'}
            </div>
        `;
    }

    function renderProductOptions(products) {
        if (!products.length) {
            return '<div style="padding: 18px; color: var(--color-gray-500); font-size: 13px; background: var(--color-gray-50); border-radius: 8px;">No products found.</div>';
        }

        return products.map(product => `
            <button type="button" class="draft-product-option" data-product-id="${escapeAttribute(product.id)}" style="border: 1px solid var(--color-gray-200); background: white; border-radius: 8px; padding: 10px; text-align: left; cursor: pointer; display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: center;">
                <span>
                    <strong style="display: block; font-size: 13px; color: var(--color-gray-900);">${escapeHtml(product.displayName || product.name || 'Product')}</strong>
                    <small style="color: var(--color-gray-500);">${escapeHtml(product.name_ru || product.name_en || '')}</small>
                </span>
                <span style="font-weight: 900; color: var(--color-primary-700);">${formatCurrency(product.price || 0)}</span>
            </button>
        `).join('');
    }

    function recalculateInvoiceDraftTotals(invoiceDraft) {
        return invoiceController.recalculateInvoiceTotals(Object.assign({}, invoice, invoiceDraft));
    }

    function addProductToInvoiceDraft(invoiceDraft, product, quantity = 1) {
        const addQuantity = safeNumber(quantity, 1);
        if (addQuantity <= 0) {
            return invoiceDraft;
        }

        const productId = product.id || product.productId || '';
        const items = (invoiceDraft.items || []).map(item => Object.assign({}, item));
        const existingIndex = items.findIndex(item => item.productId && item.productId === productId);

        if (existingIndex >= 0) {
            const currentQuantity = safeNumber(items[existingIndex].quantity, 0);
            const nextQuantity = currentQuantity + addQuantity;
            items[existingIndex] = Object.assign({}, items[existingIndex], {
                quantity: nextQuantity,
                adjustedQuantity: nextQuantity,
                total: safeNumber(items[existingIndex].price, 0) * nextQuantity
            });
        } else {
            items.push(invoiceController.buildInvoiceItemFromProduct(product, addQuantity));
        }

        return recalculateInvoiceDraftTotals(Object.assign({}, invoiceDraft, { items }));
    }

    function removeProductFromInvoiceDraft(invoiceDraft, lineItemId) {
        const items = (invoiceDraft.items || []).filter(item => item.lineItemId !== lineItemId);
        return recalculateInvoiceDraftTotals(Object.assign({}, invoiceDraft, { items }));
    }

    function updateInvoiceDraftItemQuantity(invoiceDraft, lineItemId, quantity) {
        const nextQuantity = safeNumber(quantity, 0);
        const items = (invoiceDraft.items || []).map(item => {
            if (item.lineItemId !== lineItemId) {
                return item;
            }
            return Object.assign({}, item, {
                quantity: nextQuantity,
                adjustedQuantity: nextQuantity,
                total: safeNumber(item.price, 0) * nextQuantity
            });
        });
        return recalculateInvoiceDraftTotals(Object.assign({}, invoiceDraft, { items }));
    }

    function validateInvoiceItemDraft(invoiceDraft) {
        const items = invoiceDraft.items || [];
        if (!items.length) {
            return 'Invoice must have at least one item.';
        }
        for (const item of items) {
            const quantity = safeNumber(item.quantity, 0);
            const returnedQuantity = getItemReturnedQuantity(item);
            if (quantity <= 0) {
                return 'Quantity must be a positive number.';
            }
            if (quantity < returnedQuantity) {
                return 'Quantity cannot be less than the returned quantity.';
            }
        }
        return '';
    }

    function renderEditInvoiceItemsModal(invoiceDraft, productSearchTerm = '') {
        const items = invoiceDraft.items || [];
        const term = productSearchTerm.trim().toLowerCase();
        const filteredProducts = allProducts.filter(product => {
            if (!term) return true;
            return [product.displayName, product.name, product.name_en, product.name_ru, product.name_kg]
                .some(value => String(value || '').toLowerCase().includes(term));
        });
        const productOptions = filteredProducts.map(product => `
            <option value="${escapeAttribute(product.id)}">${escapeHtml(product.displayName || product.name || 'Product')} - ${escapeHtml(formatCurrency(product.price || 0))}</option>
        `).join('');

        return `
            <div class="edit-invoice-items-modal no-print" style="display: grid; gap: 16px;">
                <div style="display: grid; grid-template-columns: minmax(220px, 1fr) minmax(220px, 1.4fr) 90px auto; gap: 10px; align-items: end; padding: 12px; background: var(--color-gray-50); border: 1px solid var(--color-gray-200); border-radius: 8px;">
                    <label style="display: grid; gap: 6px;">
                        <span style="font-size: 12px; font-weight: 900; color: var(--color-gray-600);">Search products</span>
                        <input id="edit-product-search" class="input" type="search" value="${escapeAttribute(productSearchTerm)}" placeholder="Search products..." style="height: 36px;">
                    </label>
                    <label style="display: grid; gap: 6px;">
                        <span style="font-size: 12px; font-weight: 900; color: var(--color-gray-600);">Product</span>
                        <select id="edit-product-select" class="input" style="height: 36px;" ${filteredProducts.length ? '' : 'disabled'}>
                            ${productOptions || '<option value="">No products found</option>'}
                        </select>
                    </label>
                    <label style="display: grid; gap: 6px;">
                        <span style="font-size: 12px; font-weight: 900; color: var(--color-gray-600);">Qty</span>
                        <input id="edit-product-quantity" class="input" type="number" min="1" step="1" value="1" style="height: 36px; text-align: center;">
                    </label>
                    <button type="button" id="btn-edit-add-product" class="btn btn-primary btn-sm" style="height: 36px;">Add Product</button>
                </div>

                <div style="overflow-x: auto; border: 1px solid var(--color-gray-200); border-radius: 8px;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                        <thead style="background: var(--color-gray-50); border-bottom: 1px solid var(--color-gray-200);">
                            <tr>
                                <th style="text-align: left; padding: 10px;">Product</th>
                                <th style="text-align: right; padding: 10px; width: 120px;">Unit price</th>
                                <th style="text-align: center; padding: 10px; width: 130px;">Quantity</th>
                                <th style="text-align: right; padding: 10px; width: 130px;">Line total</th>
                                <th style="text-align: right; padding: 10px; width: 90px;"></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${items.length ? items.map(item => {
                                const returnedQuantity = getItemReturnedQuantity(item);
                                const minQuantity = Math.max(1, returnedQuantity);
                                return `
                                    <tr style="border-bottom: 1px solid var(--color-gray-100);">
                                        <td style="padding: 10px;">
                                            <div style="font-weight: 800; color: var(--color-gray-900);">${escapeHtml(getItemDisplayName(item))}</div>
                                            ${item.weight ? `<div style="font-size: 11px; color: var(--color-gray-500); margin-top: 2px;">${escapeHtml(item.weight)}</div>` : ''}
                                            ${returnedQuantity > 0 ? `<div style="font-size: 11px; color: #991b1b; margin-top: 2px; font-weight: 800;">Returned: ${returnedQuantity}</div>` : ''}
                                        </td>
                                        <td style="padding: 10px; text-align: right;">${formatCurrency(item.price || 0)}</td>
                                        <td style="padding: 10px; text-align: center;">
                                            <input class="edit-item-qty input" type="number" min="${minQuantity}" step="1" value="${safeNumber(item.quantity, 1)}" data-line-item-id="${escapeAttribute(item.lineItemId)}" style="width: 88px; height: 32px; text-align: center;">
                                        </td>
                                        <td style="padding: 10px; text-align: right; font-weight: 900;">${formatCurrency(item.total || 0)}</td>
                                        <td style="padding: 10px; text-align: right;">
                                            <button type="button" class="btn btn-secondary btn-sm edit-remove-item" data-line-item-id="${escapeAttribute(item.lineItemId)}">Remove</button>
                                        </td>
                                    </tr>
                                `;
                            }).join('') : `
                                <tr>
                                    <td colspan="5" style="padding: 18px; text-align: center; color: var(--color-gray-500);">No products on this invoice.</td>
                                </tr>
                            `}
                        </tbody>
                    </table>
                </div>

                <div id="edit-invoice-validation" style="min-height: 18px; font-size: 12px; font-weight: 800; color: #991b1b;">${escapeHtml(validateInvoiceItemDraft(invoiceDraft))}</div>

                <div style="display: grid; justify-content: end; gap: 8px;">
                    <div style="display: grid; grid-template-columns: 150px 140px; gap: 10px; font-size: 13px;">
                        <span style="text-align: right; color: var(--color-gray-500); font-weight: 800;">Subtotal</span>
                        <strong style="text-align: right;">${formatCurrency(invoiceDraft.subtotal || 0)}</strong>
                        ${(invoiceDraft.taxRate || invoiceDraft.taxAmount) ? `
                            <span style="text-align: right; color: var(--color-gray-500); font-weight: 800;">Tax</span>
                            <strong style="text-align: right;">${formatCurrency(invoiceDraft.taxAmount || 0)}</strong>
                        ` : ''}
                        ${(invoiceDraft.discountAmount || 0) ? `
                            <span style="text-align: right; color: var(--color-gray-500); font-weight: 800;">Discount</span>
                            <strong style="text-align: right;">-${formatCurrency(invoiceDraft.discountAmount || 0)}</strong>
                        ` : ''}
                        ${(invoiceDraft.returnSummary?.totalReturnedAmount || 0) ? `
                            <span style="text-align: right; color: #991b1b; font-weight: 800;">Returned</span>
                            <strong style="text-align: right; color: #991b1b;">-${formatCurrency(invoiceDraft.returnSummary.totalReturnedAmount || 0)}</strong>
                            <span style="text-align: right; color: #991b1b; font-weight: 800;">After returns</span>
                            <strong style="text-align: right; color: #991b1b;">${formatCurrency(invoiceDraft.returnSummary.adjustedTotalAmount || 0)}</strong>
                        ` : ''}
                        <span style="text-align: right; color: var(--color-gray-900); font-weight: 900;">Total</span>
                        <strong style="text-align: right; color: var(--color-primary-700);">${formatCurrency(invoiceDraft.totalAmount || 0)}</strong>
                    </div>
                </div>
            </div>
        `;
    }

    async function openEditInvoiceItemsModal() {
        if (!isInvoiceItemsEditable()) {
            const { notificationService } = await import("../core/notificationService.js");
            notificationService.error(getInvoiceWorkflowLockMessage(invoice));
            return;
        }

        const { Modal } = await import("../components/modal.js");
        let productSearchTerm = '';
        let invoiceDraft = recalculateInvoiceDraftTotals({
            items: getEditableItems().map(item => Object.assign({}, item))
        });

        const modal = new Modal({
            title: 'Edit Invoice Items',
            size: 'xlarge',
            confirmText: 'Save',
            content: renderEditInvoiceItemsModal(invoiceDraft, productSearchTerm),
            onConfirm: async () => {
                const { notificationService } = await import("../core/notificationService.js");
                const validationMessage = validateInvoiceItemDraft(invoiceDraft);
                if (validationMessage) {
                    notificationService.error(validationMessage);
                    return false;
                }

                const saveButton = modal.modalEl?.querySelector('.confirm-btn');
                const originalText = saveButton?.textContent || 'Save';
                if (saveButton) {
                    saveButton.disabled = true;
                    saveButton.textContent = 'Saving...';
                }

                const success = await invoiceController.saveInvoiceItems(invoice.id, invoiceDraft.items);
                if (!success) {
                    if (saveButton) {
                        saveButton.disabled = false;
                        saveButton.textContent = originalText;
                    }
                    return false;
                }

                invoice = recalculateInvoiceDraftTotals({
                    items: invoiceDraft.items
                });
                refreshBody();
                return true;
            }
        });

        const refreshModal = () => {
            const body = modal.modalEl?.querySelector('.modal-body');
            if (!body) return;
            invoiceDraft = recalculateInvoiceDraftTotals({
                items: invoiceDraft.items || []
            });
            body.innerHTML = renderEditInvoiceItemsModal(invoiceDraft, productSearchTerm);
            attachModalListeners();
        };

        const refreshProductOptions = () => {
            const search = document.getElementById('edit-product-search');
            const select = document.getElementById('edit-product-select');
            if (!search || !select) return;
            productSearchTerm = search.value || '';
            const term = productSearchTerm.trim().toLowerCase();
            const filteredProducts = allProducts.filter(product => {
                if (!term) return true;
                return [product.displayName, product.name, product.name_en, product.name_ru, product.name_kg]
                    .some(value => String(value || '').toLowerCase().includes(term));
            });
            select.disabled = filteredProducts.length === 0;
            select.innerHTML = filteredProducts.length
                ? filteredProducts.map(product => `<option value="${escapeAttribute(product.id)}">${escapeHtml(product.displayName || product.name || 'Product')} - ${escapeHtml(formatCurrency(product.price || 0))}</option>`).join('')
                : '<option value="">No products found</option>';
        };

        const attachModalListeners = () => {
            document.getElementById('edit-product-search')?.addEventListener('input', refreshProductOptions);

            document.getElementById('btn-edit-add-product')?.addEventListener('click', async () => {
                const { notificationService } = await import("../core/notificationService.js");
                const select = document.getElementById('edit-product-select');
                const quantityInput = document.getElementById('edit-product-quantity');
                const product = allProducts.find(entry => entry.id === select?.value);
                const quantity = safeNumber(quantityInput?.value, 1);
                if (!product) {
                    notificationService.error('Select a product to add.');
                    return;
                }
                if (quantity <= 0) {
                    notificationService.error('Quantity must be a positive number.');
                    return;
                }
                invoiceDraft = addProductToInvoiceDraft(invoiceDraft, product, quantity);
                refreshModal();
            });

            document.querySelectorAll('.edit-item-qty').forEach(input => {
                input.addEventListener('change', async () => {
                    const { notificationService } = await import("../core/notificationService.js");
                    const item = (invoiceDraft.items || []).find(entry => entry.lineItemId === input.dataset.lineItemId);
                    const quantity = safeNumber(input.value, 0);
                    const minQuantity = Math.max(1, getItemReturnedQuantity(item));
                    if (quantity <= 0) {
                        notificationService.error('Quantity must be a positive number.');
                        input.value = String(minQuantity);
                        return;
                    }
                    if (quantity < minQuantity) {
                        notificationService.error('Quantity cannot be less than the returned quantity.');
                        input.value = String(minQuantity);
                        return;
                    }
                    invoiceDraft = updateInvoiceDraftItemQuantity(invoiceDraft, input.dataset.lineItemId, quantity);
                    refreshModal();
                });
            });

            document.querySelectorAll('.edit-remove-item').forEach(button => {
                button.addEventListener('click', async () => {
                    const { notificationService } = await import("../core/notificationService.js");
                    const item = (invoiceDraft.items || []).find(entry => entry.lineItemId === button.dataset.lineItemId);
                    if (getItemReturnedQuantity(item) > 0) {
                        notificationService.error('Returned items cannot be removed from the invoice.');
                        return;
                    }
                    if (!confirm('Remove this product from this invoice? Inventory will not be changed.')) {
                        return;
                    }
                    invoiceDraft = removeProductFromInvoiceDraft(invoiceDraft, button.dataset.lineItemId);
                    refreshModal();
                });
            });
        };

        modal.open();
        attachModalListeners();
    }

    async function openAddProductModal() {
        const { Modal } = await import("../components/modal.js");
        const modal = new Modal({
            title: 'Add Product',
            size: 'large',
            footer: false,
            content: renderProductSelectorContent(allProducts)
        });
        modal.open();

        const search = document.getElementById('draft-product-search');
        const list = document.getElementById('draft-product-list');
        const attachProductListeners = () => {
            document.querySelectorAll('.draft-product-option').forEach(button => {
                button.addEventListener('click', async () => {
                    const product = allProducts.find(entry => entry.id === button.dataset.productId);
                    if (!product) return;
                    const success = await invoiceController.addInvoiceItem(invoice.id, product, 1);
                    if (success) {
                        modal.close();
                        renderInvoiceDetail({ id });
                    }
                });
            });
        };

        search?.addEventListener('input', () => {
            const term = search.value.trim().toLowerCase();
            const filteredProducts = allProducts.filter(product => {
                return [product.displayName, product.name, product.name_en, product.name_ru, product.name_kg]
                    .some(value => String(value || '').toLowerCase().includes(term));
            });
            list.innerHTML = renderProductOptions(filteredProducts);
            attachProductListeners();
        });
        attachProductListeners();
    }

    async function openRecordReturnModal() {
        if (!canRecordInvoiceReturn(invoice)) {
            const { notificationService } = await import("../core/notificationService.js");
            notificationService.error(getInvoiceWorkflowLockMessage(invoice));
            return;
        }

        const { Modal } = await import("../components/modal.js");
        const items = getEditableItems();
        const modal = new Modal({
            title: 'Record Returned Items',
            size: 'large',
            confirmText: 'Save Return',
            content: `
                <div style="display: grid; gap: 12px;">
                    ${items.length ? items.map(item => {
                        const soldQuantity = Number(item.quantity) || 0;
                        const alreadyReturned = Number(item.returnedQuantity) || 0;
                        const remaining = Math.max(0, soldQuantity - alreadyReturned);
                        return `
                            <label style="display: grid; grid-template-columns: minmax(180px, 1fr) repeat(4, minmax(90px, auto)); gap: 10px; align-items: center; border: 1px solid var(--color-gray-200); border-radius: 8px; padding: 10px;">
                                <span style="font-weight: 800;">${escapeHtml(getItemDisplayName(item))}</span>
                                <span style="font-size: 12px; color: var(--color-gray-500);">Sold: <strong>${soldQuantity}</strong></span>
                                <span style="font-size: 12px; color: var(--color-gray-500);">Returned: <strong>${alreadyReturned}</strong></span>
                                <span style="font-size: 12px; color: var(--color-gray-500);">Remaining: <strong>${remaining}</strong></span>
                                <input class="record-return-qty input" type="number" min="0" max="${remaining}" step="1" value="0" data-line-item-id="${escapeAttribute(item.lineItemId)}" data-product-id="${escapeAttribute(item.productId || '')}" style="width: 90px; height: 32px; text-align: center;">
                            </label>
                        `;
                    }).join('') : '<div style="padding: 18px; color: var(--color-gray-500); font-size: 13px; background: var(--color-gray-50); border-radius: 8px;">No returned items yet.</div>'}
                    <label style="display: grid; gap: 6px;">
                        <span style="font-size: 12px; font-weight: 900; color: var(--color-gray-600);">Note</span>
                        <textarea id="return-note-input" class="input" rows="3" style="resize: vertical;" placeholder="Optional note"></textarea>
                    </label>
                </div>
            `,
            onConfirm: async () => {
                const selectedItems = [...document.querySelectorAll('.record-return-qty')].map(input => ({
                    lineItemId: input.dataset.lineItemId,
                    productId: input.dataset.productId,
                    returnedQuantity: Number(input.value) || 0,
                    max: Number(input.max) || 0
                }));
                const invalid = selectedItems.find(item => item.returnedQuantity < 0 || item.returnedQuantity > item.max);
                if (invalid) {
                    const { notificationService } = await import("../core/notificationService.js");
                    notificationService.error('Return quantity cannot exceed remaining returnable quantity.');
                    return false;
                }
                if (!selectedItems.some(item => item.returnedQuantity > 0)) {
                    const { notificationService } = await import("../core/notificationService.js");
                    notificationService.error('At least one item must have a return quantity greater than 0.');
                    return false;
                }
                const success = await invoiceController.recordInvoiceReturn(invoice.id, {
                    note: document.getElementById('return-note-input')?.value || '',
                    items: selectedItems
                });
                if (success) {
                    renderInvoiceDetail({ id });
                }
                return success;
            }
        });
        modal.open();
    }

    const renderDocument = (lang, isCopy = false) => {
        // Never let fallback defaults overwrite the saved invoice snapshot.
        const hasReliableLiveSettings = liveSettings && liveSettings.__fromFallback !== true;
        const s = hasReliableLiveSettings
            ? { ...(invoice.settings || {}), ...liveSettings }
            : { ...(invoice.settings || {}) };
        const itemsPerPage = Math.min(30, Math.max(1, parseInt(s.invoiceItemsPerPage, 10) || DEFAULT_ITEMS_PER_PAGE));

        const defaultBankInfo = lang === 'en'
            ? "Bank of Kyrgyzstan,<br>Kyrgyzz Organics Ltd, KG12346712345789901<br>Account To: KG12346712345789901<br>SWIFT: KGZBBBBB"
            : (lang === 'kg' ? "Кыргызстан Банкы,<br>Кыргыз Органикс ЖЧКсы, KG12346712345789901<br>Эсеп: KG12346712345789901<br>SWIFT: KGZBBBBB" : "Банк Кыргызстана,<br>Kyrgyzz Organics Ltd, KG12346712345789901<br>Счет: KG12346712345789901<br>SWIFT: KGZBBBBB");

        const paymentTerms = lang === 'en'
            ? "Payment due within 30 days. Please transfer to account:"
            : (lang === 'kg' ? "Төлөм 30 күндүн ичинде. Сураныч, эсепке которуңуз:" : "Оплата в течение 30 дней. Перевод на счет:");

        const notesText = lang === 'en' ? (s.notesEn || paymentTerms) : (lang === 'kg' ? (s.notesKg || paymentTerms) : (s.notesRu || paymentTerms));
        const bannerFootText = s.footerText || t('print_thanks', lang);
        const logoUrl = safeImageUrl(s.logoUrl);
        const paymentQrImageUrl = safeImageUrl(s.paymentQrImageUrl);
        const invoiceNumber = escapeHtml(invoice.invoiceNumber || '');
        const companyPhone = escapeHtml(s.phone || '');
        const customerName = escapeHtml(invoice.customerName || '');
        const customerAddress = escapeHtml(invoice.customerAddress || 'Republic of Kyrgyzstan');
        const renderedNotesText = escapeHtml(notesText);
        const renderedBankInfo = renderBankInfo(s.bankInfo || defaultBankInfo);
        const renderedBannerFootText = escapeHtml(bannerFootText);
        const invoiceQrImageUrl = invoice.secureToken ? safeImageUrl(qrService.buildQrImageUrl(invoice, 240)) : '';
        const displayStatus = escapeHtml(getDisplayStatus(invoice));

        const items = (invoice.items || []).map(item => normalizeInvoiceItemReturnFields(item, invoice));
        const invoiceHasReturns = hasInvoiceReturns(invoice);
        const returnSummary = calculateInvoiceReturnSummary(invoice);
        const pages = [];

        // Keep invoice pagination predictable: each page gets the configured item count.
        let currentItemIndex = 0;
        while (currentItemIndex < items.length) {
            const pageItems = items.slice(currentItemIndex, currentItemIndex + itemsPerPage);
            pages.push(pageItems);
            currentItemIndex += itemsPerPage;
        }
        if (pages.length === 0) pages.push([]);

        const totalPages = pages.length;

        let calculatedSubtotal = 0;
        items.forEach(item => {
            calculatedSubtotal += getItemOriginalTotal(item);
        });

        const subtotal = calculatedSubtotal;
        const taxRate = invoice.taxRate || 0;
        const taxAmount = (subtotal * taxRate) / 100;

        let discountAmount = invoice.discountAmount || 0;
        // recalculate discount if percent
        if (invoice.discountType === 'percent' && invoice.discountValue) {
            discountAmount = (subtotal * invoice.discountValue) / 100;
        }

        const grandTotal = subtotal + taxAmount - discountAmount;
        const displayGrandTotal = invoiceHasReturns ? returnSummary.adjustedTotalAmount : grandTotal;

        return pages.map((pageItems, index) => {
            const pageNum = index + 1;
            const isFirst = pageNum === 1;
            const isLast = pageNum === totalPages;

            return `
                <div class="invoice-page ${pageNum === currentPage ? 'active-page' : ''}" data-page="${pageNum}" style="
                    background: white; 
                    padding: 30px 40px; 
                    height: 296mm;
                    width: 210mm;
                    margin: 0 auto;
                    color: #1e3318;
                    font-family: 'Inter', -apple-system, sans-serif;
                    position: relative;
                    box-sizing: border-box;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                    display: ${pageNum === currentPage ? 'block' : 'none'};
                    transform: scale(${invoiceScale});
                    transform-origin: top center;
                    transition: transform 0.2s ease;
                    --zoom-scale: ${invoiceScale};
                    ${pageNum === currentPage ? '' : 'position: absolute; top: -10000px;'}
                ">
                    <!-- Header (Only on Page 1 or reduced on others) -->
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; gap: 24px;">
                        <div style="flex: 1;">
                             <div style="width: 180px; min-height: 40px;">
                                 ${logoUrl ? `<img src="${logoUrl}" style="max-width: 100%; height: auto; display: block;">` : '<div style="background: #ebf0e9; border-radius: 6px; padding: 10px; color: #5a7052; font-size: 10px;">LOGO</div>'}
                             </div>
                        </div>
                        <div style="flex: 1; text-align: center; min-height: 190px; display: flex; align-items: center; justify-content: center;">
                            ${(isFirst && s.showQrCode !== false && paymentQrImageUrl) ? `
                            <div style="text-align: center;">
                                <div style="display: inline-flex; align-items: center; justify-content: center; width: 150px; height: 150px; margin-bottom: 4px;">
                                    <img src="${paymentQrImageUrl}" alt="Payment QR" style="width: 150px; height: 150px; object-fit: contain; display: block;">
                                </div>
                                <div style="font-size: 8px; font-weight: 800; color: #2e4a23; text-transform: uppercase; letter-spacing: 0.04em;">Payment</div>
                                <div style="font-size: 7px; color: #5a7052;">Scan to pay</div>
                            </div>
                            ` : ''}
                        </div>
                        <div style="text-align: right; flex: 1;">
                             <div style="display: inline-block; text-align: left;">
                             <div style="font-size: 14px; font-weight: 600; color: #1e3318; margin-bottom: 2px;">${t('print_invoice', lang)} #${invoiceNumber} ${isCopy ? '(Copy)' : ''}</div>
                                 <div style="font-size: 11px; color: #5a7052;">${t('print_date', lang)}: ${formatDate(invoice.createdAt)}</div>
                                 <div style="font-size: 11px; color: #5a7052;">Status: ${displayStatus}</div>
                                 ${isFirst ? `<div style="font-size: 11px; color: #5a7052;">${t('table_phone', lang)}: ${companyPhone}</div>` : `<div style="font-size: 11px; color: #5a7052;">Page ${pageNum} / ${totalPages} ${isCopy ? '(Copy)' : ''}</div>`}
                             </div>
                        </div>
                    </div>

                    ${isFirst ? `
                    <h2 style="font-size: 20px; font-weight: 500; color: #2e4a23; margin: 0 0 10px 0; border-bottom: 2px solid #ebf0e9; padding-bottom: 4px; letter-spacing: -0.5px;">${t('print_invoice', lang)}</h2>

                    <div style="display: flex; justify-content: space-between; margin-bottom: 15px; gap: 20px;">
                        <div style="flex: 1.2;">
                            <div style="font-weight: 700; color: #5a7052; text-transform: uppercase; font-size: 9px; letter-spacing: 1px; margin-bottom: 6px;">${t('print_bill_to', lang)}</div>
                            <div style="font-size: 15px; font-weight: 700; color: #1e3318; margin-bottom: 4px;">${customerName}</div>
                            <div style="color: #435a3c; line-height: 1.5; font-size: 12px; max-width: 300px;">
                                 ${customerAddress}
                            </div>
                        </div>
                        <div style="text-align: right; flex: 0.8;">
                             <div style="background: #ffffff; padding: 15px; border-radius: 8px; border: 1px solid #d8e2d4; display: inline-block; min-width: 200px; text-align: left; box-shadow: 0 2px 8px rgba(0,0,0,0.02);">
                                <div style="font-size: 8px; color: #5a7052; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px;">${t('print_date', lang).toUpperCase()}:</div>
                                <div style="font-size: 13px; color: #1e3318; margin-bottom: 8px; font-weight: 500;">${formatDate(invoice.createdAt)}</div>
                                <div style="font-size: 8px; color: #5a7052; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0;">TOTAL DUE:</div>
                                <div style="font-size: 22px; font-weight: 800; color: #1e3318; letter-spacing: -1px;">${formatCurrency(displayGrandTotal).replace('$', '')} <span style="font-size: 11px; font-weight: 400; color: #5a7052;">SOM</span></div>
                             </div>
                        </div>
                    </div>
                    ` : ''}

                    <!-- Product Table -->
                    ${invoiceHasReturns ? `
                    <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px; border-top: 1px solid #e2e8e0;">
                        <thead>
                            <tr style="background: #f8faf6; color: #5a7052; font-size: 8px; text-transform: uppercase; letter-spacing: 0.04em;">
                                <th style="padding: 6px 8px; text-align: left;">Product</th>
                                <th style="padding: 6px 8px; text-align: center; width: 62px;">Qty Original</th>
                                <th style="padding: 6px 8px; text-align: center; width: 62px;">Qty Returned</th>
                                <th style="padding: 6px 8px; text-align: center; width: 68px;">Qty Remaining</th>
                                <th style="padding: 6px 8px; text-align: right; width: 78px;">Price</th>
                                <th style="padding: 6px 8px; text-align: right; width: 105px;">Amount</th>
                            </tr>
                        </thead>
                        <tbody style="font-size: 11px;">
                            ${pageItems.map((item, idx) => {
                const normalizedItem = normalizeInvoiceItemReturnFields(item);
                const returnedQuantity = getItemReturnedQuantity(normalizedItem);
                const remainingQuantity = getItemRemainingQuantity(normalizedItem);
                const originalQuantity = getItemOriginalQuantity(normalizedItem);
                const originalAmount = getItemOriginalTotal(normalizedItem);
                const adjustedAmount = getItemAdjustedTotal(normalizedItem);
                let itemName = item.name;

                if (lang === 'ru') {
                    itemName = item.name_ru || item.name_en || item.displayName || item.name;
                } else if (lang === 'kg') {
                    itemName = item.name_kg || item.name_en || item.displayName || item.name;
                } else {
                    itemName = item.name_en || item.displayName || item.name;
                }

                return `
                                <tr style="background: ${returnedQuantity > 0 ? '#fff7f7' : (idx % 2 === 0 ? '#fafaf8' : '#fff')}; border-bottom: 1px solid #e2e8e0;">
                                    <td style="padding: 6px 8px;">
                                        <div style="font-weight: 700; color: #1e3318; overflow-wrap: anywhere;">${escapeHtml(itemName || 'Product')}</div>
                                        ${item.weight ? `<div style="font-size: 9px; color: #5a7052; margin-top: 1px;">${escapeHtml(item.weight)}</div>` : ''}
                                        ${renderInvoiceReturnBadge(normalizedItem, lang)}
                                    </td>
                                    <td style="padding: 6px 8px; text-align: center; color: #1e3318;">${originalQuantity}</td>
                                    <td class="invoice-returned-quantity" style="padding: 6px 8px; text-align: center; color: ${returnedQuantity > 0 ? '#991b1b' : '#94a3b8'}; font-weight: ${returnedQuantity > 0 ? '900' : '500'};">${returnedQuantity > 0 ? returnedQuantity : '-'}</td>
                                    <td style="padding: 6px 8px; text-align: center; color: #166534; font-weight: 800;">${remainingQuantity}</td>
                                    <td style="padding: 6px 8px; text-align: right; color: #1e3318;">${formatCurrency(item.price)}</td>
                                    <td style="padding: 6px 8px; text-align: right;">
                                        ${returnedQuantity > 0 ? `
                                            <div class="invoice-original-amount is-struck" style="font-size: 9px; color: #991b1b; text-decoration: line-through;">${formatCurrency(originalAmount)}</div>
                                            <div class="invoice-adjusted-amount" style="font-weight: 900; color: #166534;">${formatCurrency(adjustedAmount)}</div>
                                        ` : `<span style="font-weight: 800; color: #1e3318;">${formatCurrency(originalAmount)}</span>`}
                                    </td>
                                </tr>
                            `;
            }).join('')}
                        </tbody>
                    </table>
                    ` : `
                    <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px; border-top: 1px solid #e2e8e0;">
                        <tbody style="font-size: 12px;">
                            ${pageItems.map((item, idx) => {
                let itemName = item.name;

                if (lang === 'ru') {
                    itemName = item.name_ru || item.name_en || item.displayName || item.name;
                } else if (lang === 'kg') {
                    itemName = item.name_kg || item.name_en || item.displayName || item.name;
                } else {
                    itemName = item.name_en || item.displayName || item.name;
                }

                const finalQty = item.adjustedQuantity !== undefined ? item.adjustedQuantity : item.quantity;

                return `
                                    <tr style="background: ${idx % 2 === 0 ? '#fafaf8' : '#fff'}; border-bottom: 1px solid #e2e8e0;">
                                        <td style="padding: 6px 10px;">
                                        <div style="font-weight: 600; color: #1e3318; overflow-wrap: anywhere;">${escapeHtml(itemName || 'Product')}</div>
                                            ${item.weight ? `<div style="font-size: 9px; color: #5a7052; margin-top: 1px;">${escapeHtml(item.weight)}</div>` : ''}
                                        </td>
                                        <td style="padding: 6px 10px; text-align: center; color: #1e3318;">${finalQty}</td>
                                        <td style="padding: 6px 10px; text-align: right; color: #1e3318;">${formatCurrency(item.price)}</td>
                                        <td style="padding: 6px 10px; text-align: right; font-weight: 700; color: #1e3318;">${formatCurrency(item.price * finalQty)}</td>
                                    </tr>
                                `;
            }).join('')}
                        </tbody>
                    </table>
                    `}

                    ${isLast ? `
                    <!-- Summary Section -->
                    <div style="display: flex; justify-content: flex-end; margin-bottom: 25px; page-break-inside: avoid;">
                        ${invoiceHasReturns ? renderInvoiceTotalsWithReturns(invoice, lang) : `<div style="width: 280px;">
                            <div style="display: flex; justify-content: space-between; padding: 6px 12px; border-bottom: 1px solid #e2e8e0;">
                                <span style="color: #5a7052; font-size: 11px; font-weight: 500;">${t('print_subtotal', lang)}</span>
                                <span style="font-weight: 600; color: #1e3318; font-size: 11px;">${formatCurrency(subtotal)}</span>
                            </div>
                            ${taxAmount > 0 ? `
                            <div style="display: flex; justify-content: space-between; padding: 6px 12px; border-bottom: 1px solid #e2e8e0;">
                                <span style="color: #5a7052; font-size: 11px; font-weight: 500;">${t('print_vat', lang)} (${taxRate}%)</span>
                                <span style="font-weight: 600; color: #1e3318; font-size: 11px;">${formatCurrency(taxAmount)}</span>
                            </div>` : ''}
                            <div style="margin-top: 10px; background: #2e4a23; color: #fff; padding: 12px; border-radius: 4px; display: flex; justify-content: space-between; align-items: baseline;">
                                <span style="font-size: 10px; font-weight: 700; text-transform: uppercase;">${t('print_grand_total', lang)}</span>
                                <span style="font-size: 20px; font-weight: 800;">${formatCurrency(grandTotal)}</span>
                            </div>
                        </div>`}
                    </div>

                    ${invoiceHasReturns ? renderInvoiceReturnDetails(invoice, lang) : ''}

                    <!-- Footer -->
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 30px; border-top: 1px solid #e2e8e0; padding-top: 15px; margin-bottom: 20px; page-break-inside: avoid;">
                        <div style="flex: 1;">
                            ${(s.showNotes !== false) ? `
                            <div style="font-weight: 700; color: #5a7052; text-transform: uppercase; font-size: 9px; margin-bottom: 8px;">${t('print_notes', lang)}</div>
                            <div style="font-size: 11px; color: #5a7052; line-height: 1.5;">
                                <div style="margin-bottom: 2px;">${renderedNotesText}</div>
                                <div style="font-weight: 500; font-family: monospace; background: #fafbf9; padding: 12px; border: 1px solid #ebf0e9; border-radius: 6px; font-size: 10px; line-height: 1.6;">
                                    ${renderedBankInfo}
                                </div>
                            </div>
                            ` : ''}
                        </div>
                        <div style="display: flex; gap: 12px; align-items: center;">
                            <div style="display: flex; flex-direction: column; gap: 14px; min-width: 78px; text-align: left;">
                                <div>
                                    <div style="font-size: 10px; font-weight: 800; color: #2e4a23; text-transform: uppercase;">Invoice QR</div>
                                    <div style="font-size: 8px; color: #5a7052;">${invoiceQrImageUrl ? '0 courier &middot; 1 customer' : 'Unavailable'}</div>
                                </div>
                            </div>
                            ${invoiceQrImageUrl ? `
                            <div style="text-align: center;">
                                <div style="display: inline-block; padding: 10px; background: #fff; border: 2px solid #2e4a23; border-radius: 10px; margin-bottom: 6px;">
                                    <img src="${invoiceQrImageUrl}" alt="Invoice QR" style="width: 128px; height: 128px; display: block;">
                                </div>
                            </div>
                            ` : ''}
                        </div>
                    </div>
                    ` : ''}

                    <!-- Banner Foot -->
                    ${(s.showFooter !== false) ? `
                    <div style="position: absolute; bottom: 20px; left: 0; right: 0; padding: 12px; text-align: center; color: #5a7052; font-size: 10px;">
                        &mdash; ${renderedBannerFootText} &mdash;
                    </div>
                    ` : ''}
                </div>
            `;
        });
    };

    const refreshBody = () => {

        let finalHtml = '';
        let realTotalPages = 1;

        if (is2UpMode) {
            // Render BOTH versions (Original and Copy) for interleaving
            const originalPages = renderDocument(currentLang, false);
            const copyPages = renderDocument(currentLang, true);
            realTotalPages = originalPages.length;
            if (currentPage > realTotalPages) {
                currentPage = realTotalPages;
                return refreshBody();
            }

            originalPages.forEach((page, i) => {
                finalHtml += `
                    <div class="print-sheet">
                        <div class="sheet-half">${page}</div>
                        <div class="sheet-half">${copyPages[i] || ''}</div>
                    </div>
                `;
            });
        } else {
            const renderedPages = renderDocument(currentLang);
            realTotalPages = renderedPages.length;
            if (currentPage > realTotalPages) {
                currentPage = realTotalPages;
                return refreshBody();
            }
            finalHtml = renderedPages.join('');
        }

        container.innerHTML = `
            <div class="invoice-toolbar invoice-preview-controls no-print" style="display: flex; gap: 15px; justify-content: center; padding: 15px; border-bottom: 1px solid var(--color-gray-200); background: #f7fafc; position: sticky; top: 0; z-index: 100;">
                <button id="lang-en" class="btn ${currentLang === 'en' ? 'btn-primary' : 'btn-secondary'} btn-sm">🇬🇧 EN</button>
                <button id="lang-ru" class="btn ${currentLang === 'ru' ? 'btn-primary' : 'btn-secondary'} btn-sm">🇷🇺 RU</button>
                
                <div style="display: flex; align-items: center; gap: 8px; border-left: 1px solid var(--color-gray-200); padding-left: 15px;">
                    <span style="font-size: 12px; font-weight: 600;">Date:</span>
                    <input type="date" id="invoice-date-picker" class="input" style="padding: 2px 8px; height: 32px; font-size: 13px; width: 140px;"
                           value="${toDateInputValue(invoice.createdAt)}" ${canEditInvoiceDate(invoice) ? '' : 'disabled'}>
                </div>

                <div style="flex: 1; display: flex; justify-content: center; align-items: center; gap: 15px;">
                    <button id="prev-page" class="btn btn-secondary btn-sm" ${currentPage === 1 ? 'disabled' : ''}>← Prev</button>
                    <span style="font-weight: 600; font-size: 14px; min-width: 80px; text-align: center;">Page ${currentPage} / ${realTotalPages}</span>
                    <button id="next-page" class="btn btn-secondary btn-sm" ${currentPage === realTotalPages ? 'disabled' : ''}>Next →</button>
                </div>

                <div style="display: flex; align-items: center; gap: 8px; border-left: 1px solid var(--color-gray-200); padding-left: 15px;">
                    <span style="font-size: 12px; font-weight: 600;">Zoom:</span>
                    <input type="range" id="zoom-slider" min="0.4" max="1.5" step="0.05" value="${invoiceScale}" style="width: 100px;">
                    <span style="font-size: 11px; width: 35px;">${Math.round(invoiceScale * 100)}%</span>
                </div>

                ${renderInvoiceStatusControl()}

                <div style="display: flex; gap: 8px; border-left: 1px solid var(--color-gray-200); padding-left: 15px;">
                    ${isInvoiceItemsEditable() ? '<button id="btn-edit-invoice-items" class="btn btn-secondary btn-sm">Edit Items</button>' : ''}
                    <button id="btn-copy-qr" class="btn btn-secondary btn-sm">QR Link</button>
                    ${canRecordInvoiceReturn(invoice) ? '<button id="btn-record-return-items" class="btn btn-secondary btn-sm">Record Return</button>' : ''}
                    ${canFulfillInvoice(invoice) ? '<button id="btn-complete-invoice" class="btn btn-primary btn-sm">Complete</button>' : ''}
                    <button id="btn-print-portrait" class="btn btn-primary btn-sm">🖨️ Portrait</button>
                    <button id="btn-print-landscape" class="btn btn-secondary btn-sm" title="2 Invoices stacked on Portrait A4">📄 2-up Portrait</button>
                </div>
            </div>
            ${renderInvoiceLifecycle()}
            ${getInvoiceWorkflowLockMessage(invoice) ? `<div class="no-print" style="padding: 8px 16px; background: #fffbeb; color: #92400e; border-bottom: 1px solid #fde68a; font-size: 12px; font-weight: 800; text-align: center;">${escapeHtml(getInvoiceWorkflowLockMessage(invoice))}</div>` : ''}
            ${renderConflictReview(openConflict)}
            ${renderApprovalResponseBanner(approvalLink)}
            ${renderDraftItemEditor()}

            <div id="invoice-doc-container" class="invoice-print-container animate-fade-in ${is2UpMode ? 'printing-2up-portrait' : ''}" style="background: var(--color-gray-100); padding: 40px 0; overflow: auto; height: calc(100vh - 150px); display: flex; flex-direction: column; align-items: center; width: 100%;">
                <div class="print-wrapper invoice-document" style="display: flex; flex-direction: column; align-items: center; width: 100%;">
                    ${finalHtml}
                </div>
            </div>
            ${renderCustomerApprovalSection(approvalLink)}
            ${renderQrActivityTimeline(qrActivities)}

            <style>
                #invoice-doc-container::-webkit-scrollbar { display: none; }
                
                @media screen {
                    .invoice-page {
                        display: none;
                    }
                    .invoice-page.active-page {
                        display: block;
                    }

                    /* Small screen preview adjustment */
                    #invoice-doc-container.printing-2up-portrait .invoice-page {
                        display: block !important;
                        position: static !important;
                        box-sizing: border-box !important;
                        width: 210mm !important;
                        height: 297mm !important;
                        min-height: 297mm !important;
                        max-height: 297mm !important;
                        margin: -74.25mm 0 0 0 !important;
                        transform-origin: center center !important;
                        transform: rotate(-90deg) scale(0.68) !important;
                        opacity: 1;
                        padding: 15mm 20mm !important;
                        overflow: hidden !important;
                    }
                    
                    #invoice-doc-container.printing-2up-portrait .print-sheet {
                        display: block !important;
                        width: 210mm;
                        height: 297mm;
                        background: white;
                        margin: 0 auto 40px auto;
                        box-shadow: 0 10px 30px rgba(0,0,0,0.1);
                        position: relative;
                        font-size: 0;
                        box-sizing: border-box;
                    }

                    #invoice-doc-container.printing-2up-portrait .sheet-half {
                        width: 210mm;
                        height: 148.5mm;
                        position: relative;
                        border-bottom: 1px dashed #e2e8e0;
                        box-sizing: border-box;
                        overflow: hidden;
                    }
                }

                @media print {
                    @page { 
                        margin: 0; 
                        size: A4 portrait; 
                    }
                    
                    /* Force background colors and images */
                    * { 
                        -webkit-print-color-adjust: exact !important; 
                        print-color-adjust: exact !important; 
                        color-adjust: exact !important;
                    }
                    
                    /* Reset global layout constraints */
                    html, body { 
                        margin: 0 !important; 
                        padding: 0 !important; 
                        height: auto !important; 
                        overflow: visible !important; 
                        background: white !important;
                    }
                    
                    #app, 
                    .main-content, 
                    .page-container,
                    #invoice-doc-container {
                        display: block !important;
                        height: auto !important;
                        width: 100% !important;
                        min-width: 0 !important;
                        overflow: visible !important;
                        position: static !important;
                        padding: 0 !important;
                        margin: 0 !important;
                        transform: none !important;
                        border: none !important;
                        box-shadow: none !important;
                    }

                    /* Hide all UI elements */
                    header, nav, #sidebar, #top-bar, .app-sidebar, .btn, .loading-screen, #toast-container, #modal-container,
                    div[style*="position: sticky"], div[style*="z-index: 100"], .period-btn, #zoom-slider, input[type="range"],
                    .invoice-toolbar, .invoice-preview-controls, .customer-approval-panel, .customer-approval-card,
                    .approval-link-panel, .qr-activity-timeline, .no-print {
                        display: none !important;
                    }

                    .invoice-preview-page,
                    .invoice-document,
                    .invoice-print-container {
                        margin: 0 !important;
                        box-shadow: none !important;
                    }
                    
                    ::-webkit-scrollbar { display: none !important; }

                    /* Portrait standard page */
                    .invoice-page {
                        display: block !important;
                        visibility: visible !important;
                        opacity: 1 !important;
                        position: relative !important;
                        top: 0 !important;
                        left: 0 !important;
                        margin: 0 auto !important;
                        padding: 10mm 15mm !important; 
                        width: 210mm !important;
                        height: 296mm !important; 
                        min-height: 296mm !important;
                        box-sizing: border-box !important;
                        page-break-after: always !important;
                        page-break-inside: avoid !important;
                        transform: none !important;
                        box-shadow: none !important;
                        background: white !important;
                    }

                    #invoice-doc-container > .print-wrapper > .invoice-page:last-of-type,
                    .invoice-page:last-child {
                        page-break-after: avoid !important;
                    }

                    /* Portrait 2-up (Sideways Stack) */
                    .print-sheet {
                        display: block !important;
                        position: relative !important;
                        width: 210mm !important;
                        height: 297mm !important; 
                        page-break-after: always !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        background: white !important;
                        font-size: 0 !important;
                        overflow: hidden !important;
                        box-sizing: border-box !important;
                    }

                    #invoice-doc-container > .print-wrapper > .print-sheet:last-of-type {
                        page-break-after: avoid !important;
                    }

                    .sheet-half {
                        width: 210mm !important;
                        height: 148.5mm !important;
                        position: relative !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        display: block !important;
                        overflow: hidden !important;
                        box-sizing: border-box !important;
                        border-bottom: 1px dashed #f0f0f0 !important;
                    }

                    body.printing-2up-portrait .invoice-page {
                        display: block !important;
                        position: static !important;
                        box-sizing: border-box !important;
                        width: 210mm !important;
                        height: 297mm !important;
                        min-height: 297mm !important;
                        max-height: 297mm !important;
                        margin: -74.25mm 0 0 0 !important;
                        transform-origin: center center !important;
                        transform: rotate(-90deg) scale(0.68) !important;
                        padding: 15mm 20mm !important;
                        page-break-after: auto !important;
                        background: white !important;
                        visibility: visible !important;
                        box-shadow: none !important;
                        border: none !important;
                        overflow: hidden !important;
                    }

                    .invoice-page * {
                        overflow: visible !important;
                    }
                }
            </style>
        `;

        try {
            document.querySelectorAll('.conflict-action').forEach(function(button) {
                button.addEventListener('click', async function() {
                    const resolution = button.dataset.resolution;
                    let manualVersion = null;

                    if (resolution === 'manual') {
                        const edited = prompt('Edit the local invoice JSON before syncing:', JSON.stringify(openConflict.localVersion || {}, null, 2));
                        if (!edited) {
                            return;
                        }
                        try {
                            manualVersion = JSON.parse(edited);
                        } catch (error) {
                            alert('Manual merge JSON is invalid.');
                            return;
                        }
                    }

                    const module = await import("../services/syncService.js");
                    await module.syncService.resolveConflict(openConflict.id, resolution, manualVersion);
                    renderInvoiceDetail({ id });
                });
            });

            // Event Listeners
            document.getElementById('lang-en')?.addEventListener('click', () => { currentLang = 'en'; refreshBody(); });
            document.getElementById('lang-ru')?.addEventListener('click', () => { currentLang = 'ru'; refreshBody(); });

            document.getElementById('invoice-date-picker')?.addEventListener('change', async (e) => {
                if (!canEditInvoiceDate(invoice)) {
                    const { notificationService } = await import("../core/notificationService.js");
                    notificationService.error(getInvoiceWorkflowLockMessage(invoice));
                    e.target.value = toDateInputValue(invoice.createdAt);
                    return;
                }
                const newDate = e.target.value;
                const success = await invoiceController.updateDate(id, newDate);
                if (success) {
                    // Update local model
                    const d = new Date(newDate + 'T12:00:00');
                    invoice.createdAt = d;
                    invoice.dueDate = d;
                    refreshBody();
                }
            });

            document.getElementById('btn-generate-approval-link')?.addEventListener('click', async () => {
                const button = document.getElementById('btn-generate-approval-link');
                button.disabled = true;
                button.textContent = 'Generating...';
                const generatedLink = await invoiceController.generateApprovalLink(invoice.id);
                if (generatedLink) {
                    approvalLink = generatedLink;
                    refreshBody();
                } else {
                    button.disabled = false;
                    button.textContent = 'Generate Approval Link';
                }
            });

            document.getElementById('btn-copy-approval-link')?.addEventListener('click', async () => {
                if (!approvalLink) {
                    return;
                }
                const approvalUrl = invoiceController.buildApprovalUrl(approvalLink.token);
                if (navigator.clipboard) {
                    await navigator.clipboard.writeText(approvalUrl);
                } else {
                    prompt('Copy approval link:', approvalUrl);
                }
                const { notificationService } = await import("../core/notificationService.js");
                notificationService.success('Approval link copied.');
            });

            document.getElementById('prev-page')?.addEventListener('click', () => { if (currentPage > 1) { currentPage--; refreshBody(); } });
            document.getElementById('next-page')?.addEventListener('click', () => { if (currentPage < realTotalPages) { currentPage++; refreshBody(); } });

            document.getElementById('zoom-slider')?.addEventListener('input', (e) => {
                invoiceScale = parseFloat(e.target.value);
                const activePage = container.querySelector('.invoice-page.active-page');
                if (activePage) activePage.style.transform = `scale(${invoiceScale})`;
                if (e.target.nextElementSibling) {
                    e.target.nextElementSibling.textContent = `${Math.round(invoiceScale * 100)}%`;
                }
            });

            document.getElementById('btn-copy-qr')?.addEventListener('click', async () => {
                const { Modal } = await import("../components/modal.js");
                const links = [
                    { id: 'customer', label: 'Customer link', url: qrService.buildMobileUrl(invoice, 'customer') },
                    { id: 'courier', label: 'Courier link', url: qrService.buildMobileUrl(invoice, 'courier') },
                    { id: 'general', label: 'General link', url: qrService.buildMobileUrl(invoice) }
                ];
                const modal = new Modal({
                    title: 'QR Links',
                    footer: false,
                    content: `
                        <div style="display: grid; gap: 12px;">
                            ${links.map(link => `
                                <label style="display: grid; gap: 6px;">
                                    <span style="font-size: 12px; font-weight: 900; color: var(--color-gray-600);">${link.label}</span>
                                    <div style="display: grid; grid-template-columns: 1fr auto; gap: 8px;">
                                        <input class="input" readonly value="${escapeAttribute(link.url)}" style="font-size: 12px;">
                                        <button type="button" class="btn btn-secondary btn-sm qr-copy-link" data-link-id="${link.id}">Copy</button>
                                    </div>
                                </label>
                            `).join('')}
                        </div>
                    `
                });
                modal.open();
                document.querySelectorAll('.qr-copy-link').forEach(button => {
                    button.addEventListener('click', async () => {
                        const link = links.find(entry => entry.id === button.dataset.linkId);
                        if (navigator.clipboard) {
                            await navigator.clipboard.writeText(link.url);
                        } else {
                            prompt('Copy QR invoice link:', link.url);
                        }
                        const { notificationService } = await import("../core/notificationService.js");
                        notificationService.success(`${link.label} copied.`);
                    });
                });
            });

            document.getElementById('btn-edit-invoice-items')?.addEventListener('click', openEditInvoiceItemsModal);

            document.getElementById('btn-record-return-items')?.addEventListener('click', openRecordReturnModal);

            document.getElementById('btn-add-draft-product')?.addEventListener('click', openAddProductModal);

            document.querySelectorAll('.draft-item-qty').forEach(input => {
                input.addEventListener('change', async () => {
                    const item = getEditableItems().find(entry => entry.lineItemId === input.dataset.lineItemId);
                    const minQuantity = Math.max(1, getItemReturnedQuantity(item));
                    const quantity = Number(input.value);
                    if (!Number.isFinite(quantity) || quantity <= 0) {
                        const { notificationService } = await import("../core/notificationService.js");
                        notificationService.error('Quantity must be a positive number.');
                        input.value = String(minQuantity);
                        return;
                    }
                    if (quantity < minQuantity) {
                        const { notificationService } = await import("../core/notificationService.js");
                        notificationService.error('Quantity cannot be less than the returned quantity.');
                        input.value = String(minQuantity);
                        return;
                    }

                    const success = await invoiceController.updateInvoiceItemQuantity(invoice.id, input.dataset.lineItemId, quantity);
                    if (success) {
                        renderInvoiceDetail({ id });
                    }
                });
            });

            document.querySelectorAll('.draft-remove-item').forEach(button => {
                button.addEventListener('click', async () => {
                    const item = getEditableItems().find(entry => entry.lineItemId === button.dataset.lineItemId);
                    if (getItemReturnedQuantity(item) > 0) {
                        const { notificationService } = await import("../core/notificationService.js");
                        notificationService.error('Returned items cannot be removed from the invoice.');
                        return;
                    }
                    if (!confirm('Remove this product from the draft invoice? The product catalog will not be changed.')) {
                        return;
                    }
                    const success = await invoiceController.removeInvoiceItem(invoice.id, button.dataset.lineItemId);
                    if (success) {
                        renderInvoiceDetail({ id });
                    }
                });
            });

            document.getElementById('invoice-status-selector')?.addEventListener('change', async event => {
                const nextStatus = event.target.value;
                const previousStatus = getCanonicalInvoiceStatus(invoice.status || 'draft');
                const previousDisplayStatus = getReturnState(invoice) === 'partial'
                    ? 'partially_returned'
                    : (getReturnState(invoice) === 'full' ? 'returned' : previousStatus);
                if (nextStatus === previousDisplayStatus) {
                    return;
                }

                if (nextStatus === 'returned' || nextStatus === 'partially_returned') {
                    const returnState = getReturnState(invoice);
                    if ((nextStatus === 'returned' && returnState !== 'full')
                        || (nextStatus === 'partially_returned' && returnState !== 'partial')) {
                        event.target.value = previousDisplayStatus;
                        await openRecordReturnModal();
                        return;
                    }
                }

                if (nextStatus === 'returned' && getReturnState(invoice) !== 'full') {
                    event.target.value = previousDisplayStatus;
                    await openRecordReturnModal();
                    return;
                }

                if (confirm(`Change invoice status to ${getDisplayStatus(nextStatus)}?`)) {
                    const success = await invoiceController.updateStatus(invoice.id, nextStatus);
                    if (success) {
                        renderInvoiceDetail({ id });
                    }
                    return;
                }

                event.target.value = previousDisplayStatus;
            });

            document.getElementById('btn-complete-invoice')?.addEventListener('click', async () => {
                if (!canFulfillInvoice(invoice)) {
                    const { notificationService } = await import("../core/notificationService.js");
                    notificationService.error('Only approved invoices can be fulfilled.');
                    return;
                }
                if (!getEditableItems().length) {
                    const { notificationService } = await import("../core/notificationService.js");
                    notificationService.error('Invoice must have at least one item.');
                    return;
                }
                const { returnsService } = await import("../services/returnsService.js");
                const { notificationService } = await import("../core/notificationService.js");
                await returnsService.markCompleted(invoice.id);
                notificationService.success('Invoice fulfilled.');
                renderInvoiceDetail({ id });
            });

            const handlePrintSuccess = async () => {
                // Slight delay so the UI can settle back to normal before the modal pops
                setTimeout(async () => {
                    const { Modal } = await import("../components/modal.js");
                    const modal = new Modal({
                        title: t('modal_print_title'),
                        content: `<p style="font-size: 14px; margin-bottom: 20px; color: var(--color-gray-700);">${t('modal_print_body')}</p>`,
                        confirmText: t('btn_mark_printed'),
                        cancelText: t('btn_skip'),
                        type: 'primary',
                        onConfirm: async () => {
                            try {
                                try {
                                    const { orderService } = await import("../services/orderService.js");
                                    const { invoiceService } = await import("../services/invoiceService.js");
                                    const { gamificationService } = await import("../services/gamificationService.js");
                                    const order = await orderService.getOrderById(invoice.orderId);
                                    const orderUpdates = { isPrinted: true, printedAt: new Date() };
                                    if (order?.status === 'draft') {
                                        orderUpdates.status = 'confirmed';
                                    }
                                    await orderService.updateOrder(invoice.orderId, orderUpdates);
                                    const workflowStatus = getCanonicalInvoiceStatus(invoice.status);
                                    if (workflowStatus === 'submitted' || workflowStatus === 'draft') {
                                        await invoiceService.updateInvoice(invoice.id, { status: 'approved' });
                                        invoice.status = 'approved';
                                    }
                                    if (!order?.isPrinted) {
                                        await gamificationService.awardAction('invoicesPrinted');
                                    }
                                } catch (updateErr) {
                                    console.warn("Could not sync print status to order (order may have been deleted):", updateErr);
                                    // We continue anyway so the user isn't stuck and the animation still plays
                                }

                                // 1. Set global flag for the animation
                                window.highlightOrderId = invoice.orderId;

                                // 2. Redirect to Orders tab (Dashboard)
                                router.navigate(ROUTES.DASHBOARD);

                                const { notificationService } = await import("../core/notificationService.js");
                                notificationService.success(t('msg_invoice_printed'));
                            } catch (e) {
                                console.error("Failed post-print routine", e);
                            }
                        }
                    });
                    modal.open();
                }, 500);
            };

            const printWithAfterprint = (afterPrint) => {
                let handled = false;
                let fallbackTimer = null;
                const finish = () => {
                    if (handled) return;
                    handled = true;
                    if (fallbackTimer) {
                        clearTimeout(fallbackTimer);
                    }
                    window.removeEventListener('afterprint', finish);
                    afterPrint();
                };
                window.addEventListener('afterprint', finish, { once: true });
                try {
                    window.print();
                    fallbackTimer = setTimeout(finish, 1500);
                } catch (error) {
                    window.removeEventListener('afterprint', finish);
                    console.error('Could not open print dialog.', error);
                    notificationService.error('Could not open the print dialog. Try allowing pop-ups/printing for this site.');
                }
            };

            document.getElementById('btn-print-portrait')?.addEventListener('click', () => {
                document.body.classList.remove('printing-2up-portrait');
                printWithAfterprint(handlePrintSuccess);
            });

            document.getElementById('btn-print-landscape')?.addEventListener('click', () => {
                is2UpMode = true;
                refreshBody(); // Render duplicate pages in DOM

                document.body.classList.add('printing-2up-portrait');
                printWithAfterprint(() => {
                    document.body.classList.remove('printing-2up-portrait');
                    is2UpMode = false;
                    refreshBody();
                    handlePrintSuccess();
                });
            });
        } catch (e) {
            console.error("error attaching listener in refreshBody", e);
        }
    };

    try {
        refreshBody();
    } catch (err) {
        console.error("render invoice detail fail", err);
        container.innerHTML = `<div class="p-8 text-center" style="color: #ef4444; font-weight: 500;">Failed to render invoice. Some data may be missing or corrupt (possibly offline).</div>`;
    }
};

