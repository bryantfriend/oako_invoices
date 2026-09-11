import { workflowLocalStore } from '../services/workflowLocalStore.js';
import { createWorkflowId, createEntryTimer, suggestReturnQuantities } from '../core/invoiceProductivity.js';
import { saveAndPrepareInvoice } from '../services/invoiceWorkflowService.js';
import { reserveInvoicePrintWindow, showNativeInvoicePrint } from '../services/nativeInvoicePrintService.js';
import { orderService } from '../services/orderService.js';
import { notificationService } from '../core/notificationService.js';

export function attachCreateOrderWorkflow(options) {
    var form = options.form;
    var preferences = workflowLocalStore.preference();
    var saved = workflowLocalStore.read('draft', 'editor', null);
    var requestId = saved ? saved.requestId : createWorkflowId();
    var orderId = saved ? saved.orderId : '';
    var busy = false;
    var resetting = false;
    var timer = createEntryTimer(saved ? saved.entryMs : 0);
    var historyRequest = 0;
    var suggestionRows = [];
    if (saved && !options.hasRepeatDraft) options.restore(saved);
    if (options.hasRepeatDraft) {
        requestId = createWorkflowId();
        orderId = '';
    }

    var actions = form.querySelector('#workflow-editor-actions');
    actions.innerHTML =
        '<div class="workflow-action-row"><label>Invoice layout <select id="workflow-layout" class="input"><option value="full">Full page</option><option value="two-up-portrait">2-up portrait</option></select></label>' +
        '<button type="submit" class="btn btn-secondary" id="workflow-save" data-mode="save">Save order</button>' +
        '<button type="submit" class="btn btn-primary" id="workflow-print" data-mode="print">Save & print invoice</button></div>' +
        '<div class="workflow-action-row"><span id="workflow-draft-status" role="status"></span><button type="button" class="btn btn-ghost btn-sm" id="workflow-new">Start next customer</button></div>' +
        '<small>Ctrl+Enter: save & print · Ctrl+S: save · Alt+P: add product · Enter: next quantity</small>';
    var layout = actions.querySelector('#workflow-layout');
    var status = actions.querySelector('#workflow-draft-status');
    layout.value = preferences.layout || 'full';
    status.textContent =
        saved && !options.hasRepeatDraft ? 'Recovered your unfinished order.' : 'Draft recovery is on.';

    function draft() {
        return Object.assign({}, options.getDraft(), {
            requestId: requestId,
            orderId: orderId,
            entryMs: timer.value(),
        });
    }
    function persist() {
        if (resetting) return;
        try {
            workflowLocalStore.write('draft', 'editor', draft());
            status.textContent = orderId
                ? 'Order saved. You can retry printing without creating another.'
                : 'Draft saved on this device.';
        } catch (error) {
            status.textContent = 'Draft recovery unavailable: device storage is full. Keep this page open.';
        }
    }
    function touch() {
        timer.touch();
        persist();
    }
    function reset() {
        var latest = workflowLocalStore.read('draft', 'editor', null);
        if (!latest || latest.requestId === requestId) workflowLocalStore.remove('draft', 'editor');
        requestId = createWorkflowId();
        orderId = '';
        timer = createEntryTimer();
        // Clearing the old form must not overwrite another tab's newer saved draft.
        resetting = true;
        try {
            options.reset();
        } finally {
            resetting = false;
        }
        form.querySelector('#workflow-suggestions').replaceChildren();
        status.textContent = 'Ready for the next customer.';
        form.querySelector('#customerName').focus();
    }
    layout.addEventListener('change', function () {
        preferences.layout = layout.value;
        workflowLocalStore.write('preferences', 'desk', preferences);
    });
    actions.querySelector('#workflow-new').addEventListener('click', function () {
        if (busy) return;
        if (
            options.getDraft().items.length &&
            !orderId &&
            !window.confirm('Discard this unfinished draft and start the next customer?')
        )
            return;
        reset();
    });
    form.addEventListener('input', touch);
    form.addEventListener('change', touch);
    form.addEventListener('workflow-items-changed', persist);
    form.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey && event.target.matches('.qty-input')) {
            event.preventDefault();
            var quantities = Array.from(form.querySelectorAll('.qty-input'));
            var next = quantities[quantities.indexOf(event.target) + 1];
            if (next) {
                next.focus();
                next.select();
            } else {
                actions.querySelector('#workflow-print').focus();
            }
            return;
        }
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault();
            form.requestSubmit(actions.querySelector('#workflow-print'));
        }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
            event.preventDefault();
            form.requestSubmit(actions.querySelector('#workflow-save'));
        }
        if (event.altKey && event.key.toLowerCase() === 'p') {
            event.preventDefault();
            form.querySelector('#add-item-btn').click();
        }
    });
    form.addEventListener('submit', async function (event) {
        event.preventDefault();
        if (busy || !form.reportValidity()) return;
        var saveOnly = event.submitter && event.submitter.dataset.mode === 'save';
        var current = draft();
        if (!current.items.length) {
            notificationService.error('Add at least one product.');
            return;
        }
        var popup;
        try {
            // Reserve from the user's gesture before any asynchronous preparation.
            if (!saveOnly) popup = reserveInvoicePrintWindow();
            workflowLocalStore.write('draft', 'editor', current);
            busy = true;
            Array.from(form.elements).forEach(function (element) {
                element.disabled = true;
            });
            status.textContent = 'Saving order and preparing invoice…';
            var result = await saveAndPrepareInvoice(current, {
                saveOnly: saveOnly,
                checkpoint: function (checkpoint) {
                    orderId = checkpoint.orderId;
                    workflowLocalStore.write('draft', 'editor', checkpoint);
                },
            });
            orderId = result.order.id;
            persist();
            if (saveOnly) {
                status.textContent = 'Order saved. Continue editing or print its invoice.';
                return;
            }
            await showNativeInvoicePrint(popup, [result.invoice], options.settings, {
                layout: layout.value,
                onConfirmed: function () {
                    // Do not clear a new customer's draft if another tab has already started one.
                    var latest = workflowLocalStore.read('draft', 'editor', null);
                    if (latest && latest.requestId === current.requestId)
                        workflowLocalStore.remove('draft', 'editor');
                    if (form.isConnected && requestId === current.requestId) reset();
                },
            });
            status.textContent =
                'Invoice ready in the print window. Confirm the paper there, or reopen printing here.';
        } catch (error) {
            if (popup && !popup.closed && !popup.document.getElementById('job-print'))
                popup.document.body.textContent = error.message + ' Return to the editor to retry.';
            status.textContent = error.message;
            notificationService.error(error.message);
        } finally {
            busy = false;
            Array.from(form.elements).forEach(function (element) {
                element.disabled = false;
            });
        }
    });

    async function refreshSuggestions() {
        var customerName = form.querySelector('#customerName').value;
        var request = ++historyRequest;
        var history = await orderService.getOrdersByCustomerName(customerName).catch(function () {
            return [];
        });
        if (!form.isConnected || request !== historyRequest) return;
        suggestionRows = suggestReturnQuantities(options.getDraft().items, history.slice(0, 12));
        var mount = form.querySelector('#workflow-suggestions');
        mount.replaceChildren();
        suggestionRows.forEach(function (row) {
            var line = document.createElement('div');
            line.className = 'workflow-suggestion';
            var description = document.createElement('span');
            description.textContent =
                row.name +
                ': try ' +
                row.suggested +
                ' instead of ' +
                row.current +
                '. ' +
                row.returned +
                ' of ' +
                row.ordered +
                ' returned across ' +
                row.samples +
                ' completed orders.';
            var button = document.createElement('button');
            button.type = 'button';
            button.className = 'btn btn-secondary btn-sm';
            button.textContent = 'Use suggestion';
            button.onclick = function () {
                var items = options.getDraft().items;
                if (
                    !items[row.index] ||
                    items[row.index].productId !== row.productId ||
                    Number(items[row.index].quantity) !== row.current
                ) {
                    refreshSuggestions();
                    return;
                }
                items[row.index].quantity = row.suggested;
                options.setItems(items);
                workflowLocalStore.event('suggestion_applied', { samples: row.samples });
                persist();
                refreshSuggestions();
            };
            line.append(description, button);
            mount.append(line);
        });
    }
    form.querySelector('#workflow-refresh-suggestions').addEventListener('click', refreshSuggestions);
    form.querySelector('#customerName').addEventListener('change', refreshSuggestions);
    form.querySelector('#customerName').focus();
    persist();
}
