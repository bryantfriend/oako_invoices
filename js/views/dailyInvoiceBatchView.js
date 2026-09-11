import { layoutView } from './layoutView.js';
import { dailyOrdersController } from '../controllers/dailyOrdersController.js';
import { buildDailyBatchRows, normalizeWorkflowOrder } from '../core/invoiceProductivity.js';
import { buildPricedOrderItemFromProduct } from '../core/pricing.js';
import { getLocalDateKey } from '../services/operationsPlanningService.js';
import { workflowLocalStore } from '../services/workflowLocalStore.js';
import { prepareDailyInvoiceBatch } from '../services/invoiceWorkflowService.js';
import { invoiceService } from '../services/invoiceService.js';
import { reserveInvoicePrintWindow, showNativeInvoicePrint } from '../services/nativeInvoicePrintService.js';
import bulkInvoicePrintService from '../services/bulkInvoicePrintService.js';
import { formatCurrency } from '../core/formatters.js';
import { mountInvoiceProductivityPanel } from '../components/invoiceProductivityPanel.js';
import { getCurrentNavigationId, isNavigationStillCurrent } from '../core/routeGuard.js';

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export async function renderDailyInvoiceBatch(params, routeContext) {
    var navigationId = routeContext ? routeContext.navigationId : getCurrentNavigationId();
    layoutView.render('route-change');
    layoutView.updateTitle('Daily invoice batch');
    var container = document.getElementById('page-container');
    container.innerHTML =
        '<p class="workflow-loading" role="status">Loading customers, catalog and recent orders…</p>';
    var workspace;
    try {
        workspace = await dailyOrdersController.loadWorkspace();
    } catch (error) {
        container.textContent = 'Could not load the batch workspace: ' + error.message;
        return;
    }
    if (!isNavigationStillCurrent(navigationId, 'daily-invoices')) return;
    var saved = workflowLocalStore.read('batch', 'current', null);
    var date = saved ? saved.date : getLocalDateKey(new Date());
    var rows = saved
        ? saved.rows
        : buildDailyBatchRows(
              workspace.customers,
              workspace.orders,
              workspace.products,
              date,
              workspace.settings.defaultOrderPriceMode,
          );
    var busy = false;
    var message = saved
        ? 'Recovered your batch. Ready invoices and saved orders will be reused.'
        : 'Review quantities, select customers, then prepare their invoices.';
    var search = '';
    var preferences = workflowLocalStore.preference();

    function persist() {
        workflowLocalStore.write('batch', 'current', { date: date, rows: rows });
    }
    function updateSummary() {
        var selected = rows.filter(function (row) {
            return row.selected;
        });
        var total = selected.reduce(function (sum, row) {
            return sum + normalizeWorkflowOrder(row).totalAmount;
        }, 0);
        container.querySelector('#batch-summary').textContent =
            selected.length + ' customers selected · ' + formatCurrency(total);
    }
    function renderRows() {
        var list = container.querySelector('#batch-rows');
        list.innerHTML =
            rows
                .map(function (row, index) {
                    if (row.customerName.toLowerCase().indexOf(search.toLowerCase()) === -1) return '';
                    var locked = busy || !!row.existingOrderId || !!row.invoiceId;
                    return (
                        '<article class="batch-customer ' +
                        (row.status === 'ready' ? 'is-ready' : '') +
                        '" data-row="' +
                        index +
                        '">' +
                        '<header><label><input type="checkbox" data-select="' +
                        index +
                        '" ' +
                        (row.selected ? 'checked' : '') +
                        (busy ? ' disabled' : '') +
                        '> <strong>' +
                        escapeHtml(row.customerName) +
                        '</strong></label>' +
                        '<span>' +
                        (row.status === 'printed'
                            ? 'Printed ✓'
                            : row.status === 'ready'
                              ? 'Invoice ready ✓'
                              : row.existingOrderId
                                ? 'Existing order — select to prepare or reprint'
                                : 'New order') +
                        '</span></header>' +
                        '<div class="batch-lines">' +
                        row.items
                            .map(function (item, itemIndex) {
                                return (
                                    '<label class="batch-line"><span>' +
                                    escapeHtml(item.name || item.name_en) +
                                    '<small>' +
                                    escapeHtml(
                                        formatCurrency(
                                            item.unitPrice !== undefined ? item.unitPrice : item.price,
                                        ),
                                    ) +
                                    '</small></span>' +
                                    '<input class="input" aria-label="' +
                                    escapeHtml(row.customerName + ' · ' + (item.name || item.name_en)) +
                                    ' quantity" type="number" min="0" step="1" value="' +
                                    Number(item.quantity || 0) +
                                    '" data-quantity="' +
                                    index +
                                    ':' +
                                    itemIndex +
                                    '" ' +
                                    (locked ? 'disabled' : '') +
                                    '></label>'
                                );
                            })
                            .join('') +
                        '</div>' +
                        (!locked
                            ? '<div class="batch-add"><select class="input" aria-label="Add a product for ' +
                              escapeHtml(row.customerName) +
                              '" data-add="' +
                              index +
                              '"><option value="">+ Add product</option>' +
                              workspace.products
                                  .filter(function (product) {
                                      return product.active !== false && product.isActive !== false;
                                  })
                                  .map(function (product) {
                                      return (
                                          '<option value="' +
                                          escapeHtml(product.id) +
                                          '">' +
                                          escapeHtml(product.name || product.name_en || product.displayName) +
                                          '</option>'
                                      );
                                  })
                                  .join('') +
                              '</select><small>Quantity 0 removes a product.</small></div>'
                            : '') +
                        (row.warnings.length
                            ? '<p class="workflow-notice">' +
                              row.warnings.map(escapeHtml).join('<br>') +
                              '</p>'
                            : '') +
                        (row.error
                            ? '<p class="workflow-error" role="alert">' + escapeHtml(row.error) + '</p>'
                            : '') +
                        (row.orderId || row.existingOrderId
                            ? '<a href="#/orders/' +
                              encodeURIComponent(row.orderId || row.existingOrderId) +
                              '">Open saved order</a>'
                            : '') +
                        '</article>'
                    );
                })
                .join('') ||
            '<div class="workflow-empty">No matching customers with order history. Create their first order to start a usual basket.</div>';
        list.querySelectorAll('[data-select]').forEach(function (input) {
            input.onchange = function () {
                rows[Number(input.dataset.select)].selected = input.checked;
                persist();
                updateSummary();
            };
        });
        list.querySelectorAll('[data-quantity]').forEach(function (input) {
            input.onchange = function () {
                var parts = input.dataset.quantity.split(':').map(Number);
                rows[parts[0]].items[parts[1]].quantity = Math.max(0, Number(input.value) || 0);
                persist();
                updateSummary();
            };
        });
        list.querySelectorAll('[data-add]').forEach(function (select) {
            select.onchange = function () {
                var row = rows[Number(select.dataset.add)];
                var product = workspace.products.find(function (candidate) {
                    return candidate.id === select.value;
                });
                if (!product) return;
                try {
                    var existing = row.items.find(function (item) {
                        return item.productId === product.id;
                    });
                    if (existing) existing.quantity += 1;
                    else row.items.push(buildPricedOrderItemFromProduct(product, row.selectedPriceMode, 1));
                    persist();
                    renderRows();
                    updateSummary();
                } catch (error) {
                    container.querySelector('#batch-status').textContent = error.message;
                }
            };
        });
    }
    function render() {
        container.innerHTML =
            '<div class="invoice-batch-workspace"><header class="workflow-heading"><div><span class="workflow-eyebrow">Daily routine</span><h1>Prepare the day’s invoices</h1><p>Review regular customers together. Saved invoices are reused when you retry.</p></div><a class="btn btn-secondary" href="#/orders/create">One new order</a></header>' +
            '<div id="invoice-productivity-panel"></div>' +
            '<section class="workflow-editor-actions"><div class="workflow-action-row"><label>Delivery date <input class="input" type="date" id="batch-date" value="' +
            date +
            '" ' +
            (busy ? 'disabled' : '') +
            '></label>' +
            '<label>Find customer <input class="input" type="search" id="batch-search" placeholder="Customer name" value="' +
            escapeHtml(search) +
            '"></label>' +
            '<label>Layout <select class="input" id="batch-layout"><option value="full">Full page</option><option value="two-up-portrait">2-up portrait</option></select></label>' +
            '<button class="btn btn-secondary" id="batch-select" ' +
            (busy ? 'disabled' : '') +
            '>Select visible new orders</button>' +
            '<button class="btn btn-primary" id="batch-prepare" ' +
            (busy ? 'disabled' : '') +
            '>Prepare selected invoices</button>' +
            '<button class="btn btn-primary" id="batch-print" ' +
            (busy ? 'disabled' : '') +
            '>Print ready invoices</button>' +
            '<button class="btn btn-secondary" id="batch-pdf" ' +
            (busy ? 'disabled' : '') +
            '>Export ready PDF</button></div>' +
            '<div class="workflow-action-row"><strong id="batch-summary"></strong><span id="batch-status" role="status">' +
            escapeHtml(message) +
            '</span></div></section><div id="batch-rows"></div></div>';
        renderRows();
        updateSummary();
        mountInvoiceProductivityPanel(
            container.querySelector('#invoice-productivity-panel'),
            workspace.orders,
            date,
        );
        var layout = container.querySelector('#batch-layout');
        layout.value = preferences.layout;
        layout.onchange = function () {
            preferences.layout = layout.value;
            workflowLocalStore.write('preferences', 'desk', preferences);
        };
        container.querySelector('#batch-search').oninput = function (event) {
            search = event.target.value;
            renderRows();
        };
        container.querySelector('#batch-date').onchange = function (event) {
            if (!event.target.value) return;
            if (
                rows.some(function (row) {
                    return row.orderId || row.status === 'failed';
                }) &&
                !confirm('Start a worksheet for another day? Saved orders remain available in Orders.')
            ) {
                event.target.value = date;
                return;
            }
            date = event.target.value;
            rows = buildDailyBatchRows(
                workspace.customers,
                workspace.orders,
                workspace.products,
                date,
                workspace.settings.defaultOrderPriceMode,
            );
            persist();
            render();
        };
        container.querySelector('#batch-select').onclick = function () {
            rows.forEach(function (row) {
                if (
                    !row.existingOrderId &&
                    row.customerName.toLowerCase().indexOf(search.toLowerCase()) !== -1
                )
                    row.selected = true;
            });
            persist();
            renderRows();
            updateSummary();
        };
        container.querySelector('#batch-prepare').onclick = prepareSelected;
        container.querySelector('#batch-print').onclick = function () {
            printReady(false);
        };
        container.querySelector('#batch-pdf').onclick = function () {
            printReady(true);
        };
    }
    async function prepareSelected() {
        if (busy) return;
        var selection = rows.filter(function (row) {
            return row.selected && !row.invoiceId;
        });
        if (!selection.length) {
            container.querySelector('#batch-status').textContent =
                'Select customers whose invoices need preparation.';
            return;
        }
        busy = true;
        message = 'Preparing invoices…';
        render();
        try {
            // Write the reviewed request identities before any network mutation.
            persist();
            var result = await prepareDailyInvoiceBatch(selection, function (current, completed) {
                persist();
                if (container.querySelector('#batch-status'))
                    container.querySelector('#batch-status').textContent =
                        'Prepared ' + (completed || 0) + ' of ' + selection.length + '…';
            });
            result.completed.forEach(function (row) {
                if (
                    !workspace.orders.some(function (order) {
                        return order.id === row.orderId;
                    })
                )
                    workspace.orders.push(
                        Object.assign({}, normalizeWorkflowOrder(row), { id: row.orderId }),
                    );
            });
            var readyCount = rows.filter(function (row) {
                return row.selected && row.invoiceId;
            }).length;
            message =
                readyCount +
                ' ready · ' +
                result.failed.length +
                ' need attention. ' +
                result.completed.length +
                ' prepared in this pass.';
        } catch (error) {
            message = error.message;
        } finally {
            busy = false;
            if (isNavigationStillCurrent(navigationId, 'daily-invoices')) render();
        }
    }
    async function printReady(pdf) {
        if (busy) return;
        var selection = rows.filter(function (row) {
            return row.selected && row.invoiceId;
        });
        if (!selection.length) {
            container.querySelector('#batch-status').textContent = 'Prepare the selected invoices first.';
            return;
        }
        var popup;
        try {
            popup = reserveInvoicePrintWindow();
            busy = true;
            if (pdf) {
                await bulkInvoicePrintService.generateCombinedPdf(
                    selection.map(function (row) {
                        return row.orderId;
                    }),
                    preferences.layout,
                    { settings: workspace.settings },
                    { previewWindow: popup },
                );
            } else {
                var invoices = await Promise.all(
                    selection.map(function (row) {
                        return invoiceService.getInvoice(row.invoiceId);
                    }),
                );
                if (
                    invoices.some(function (invoice) {
                        return !invoice;
                    })
                )
                    throw new Error('An invoice could not be loaded. Retry when its data is available.');
                await showNativeInvoicePrint(popup, invoices, workspace.settings, {
                    layout: preferences.layout,
                    onConfirmed: function () {
                        selection.forEach(function (row) {
                            row.status = 'printed';
                            var order = workspace.orders.find(function (record) {
                                return record.id === row.orderId;
                            });
                            if (order) order.isPrinted = true;
                        });
                        persist();
                        if (isNavigationStillCurrent(navigationId, 'daily-invoices')) {
                            message = 'Printed invoices confirmed. Your batch is saved.';
                            render();
                        }
                    },
                });
            }
        } catch (error) {
            message = error.message;
            if (popup && !popup.closed) popup.document.body.textContent = error.message;
        } finally {
            busy = false;
            if (isNavigationStillCurrent(navigationId, 'daily-invoices')) render();
        }
    }
    render();
}
