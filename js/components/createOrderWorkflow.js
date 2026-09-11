import { workflowLocalStore } from '../services/workflowLocalStore.js';
import { createWorkflowId, createEntryTimer, suggestReturnQuantities } from '../core/invoiceProductivity.js';
import { saveAndPrepareInvoice } from '../services/invoiceWorkflowService.js';
import { reserveInvoicePrintWindow, showNativeInvoicePrint } from '../services/nativeInvoicePrintService.js';
import { orderService } from '../services/orderService.js';
import { notificationService } from '../core/notificationService.js';

export function attachCreateOrderWorkflow(options) {
    var form = options.form;
    var preferences = workflowLocalStore.preference();
    var saved = readPreviousDraft();
    var requestId = createWorkflowId();
    var orderId = '';
    var started = false;
    var busy = false;
    var resetting = false;
    var recoveryMessage = '';
    var timer = createEntryTimer();
    var historyRequest = 0;
    var suggestionRows = [];
    // New Order always opens a fresh editor. Recovery and Repeat Order are
    // explicit choices; visiting this route must never silently select an invoice.

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
    status.textContent = 'Ready for a new order. Draft recovery is on.';
    var resumePanel = form.querySelector('#workflow-resume');
    resumePanel.innerHTML = '<div class="workflow-action-row"><span id="workflow-resume-description"></span>' +
        '<button type="button" class="btn btn-secondary btn-sm" id="workflow-resume-button">Resume previous draft</button></div>';
    updateResumePanel();

    function hasEntries(value) {
        return !!(value && (String(value.customerName || '').trim() || String(value.notes || '').trim() ||
            (Array.isArray(value.items) && value.items.length)));
    }
    function readPreviousDraft() {
        var current = workflowLocalStore.read('draft', 'editor', null);
        if (hasEntries(current)) return current;
        var previous = workflowLocalStore.read('draft', 'previous-editor', null);
        return hasEntries(previous) ? previous : null;
    }
    function updateResumePanel() {
        resumePanel.hidden = !saved || options.hasRepeatDraft === true;
        resumePanel.style.display = resumePanel.hidden ? 'none' : '';
        form.querySelector('#workflow-resume-description').textContent = saved
            ? 'Previous draft available: ' + (saved.customerName || 'Unnamed customer') + '. Resume it only to continue that order.'
            : '';
    }
    function saveLocalDraft(current) {
        // Preserve the previous recovery copy before the first edit of a fresh
        // order. Merely opening the blank editor must not overwrite either copy.
        if (!started && saved && saved.requestId !== current.requestId) {
            workflowLocalStore.write('draft', 'previous-editor', saved);
        }
        workflowLocalStore.write('draft', 'editor', current);
        started = true;
    }
    function entrySignature(value) {
        return JSON.stringify({
            customerName: String(value.customerName || '').trim(), orderDate: value.orderDate,
            notes: value.notes || '', selectedPriceMode: value.selectedPriceMode || 'retail', items: value.items || [],
        });
    }
    function removeMatchingDrafts(id, signature) {
        ['editor', 'previous-editor'].forEach(function removeMatchingCopy(key) {
            var value = workflowLocalStore.read('draft', key, null);
            if (value && value.requestId === id && (!signature || entrySignature(value) === signature)) {
                workflowLocalStore.remove('draft', key);
            }
        });
    }
    form.querySelector('#workflow-resume-button').addEventListener('click', function resumePreviousDraft() {
        if (busy || !saved) return;
        var previous = saved;
        var current = draft();
        if (hasEntries(current) && !window.confirm('Resume the previous draft? These current entries will be kept as the previous draft.')) return;
        try {
            if (hasEntries(current)) workflowLocalStore.write('draft', 'previous-editor', current);
            workflowLocalStore.write('draft', 'editor', previous);
            requestId = previous.requestId || createWorkflowId();
            orderId = previous.orderId || '';
            timer = createEntryTimer(previous.entryMs);
            started = true;
            setRecovery('');
            resetting = true;
            try { options.restore(previous); } finally { resetting = false; }
            saved = hasEntries(current) ? current : null;
            updateResumePanel();
            status.textContent = 'Previous draft resumed. Your saved order will be reused when you retry.';
            form.querySelector('#customerName').focus();
        } catch (error) {
            status.textContent = 'Could not resume the draft: ' + error.message;
            notificationService.error(status.textContent);
        }
    });

    function draft() {
        return Object.assign({}, options.getDraft(), {
            requestId: requestId,
            orderId: orderId,
            entryMs: timer.value(),
        });
    }
    function persist() {
        if (resetting) return;
        var current = draft();
        if (!started && !hasEntries(current)) return;
        try {
            saveLocalDraft(current);
            status.textContent = recoveryMessage || (orderId
                ? 'Order saved. You can retry printing without creating another.'
                : 'Draft saved on this device.');
        } catch (error) {
            status.textContent = 'Draft recovery unavailable: device storage is full. Keep this page open.';
        }
    }
    function touch() {
        timer.touch();
        persist();
    }
    function setRecovery(message) {
        recoveryMessage = message || '';
        actions.querySelector('#workflow-save').textContent = recoveryMessage
            ? 'Save as new order'
            : 'Save order';
        actions.querySelector('#workflow-print').textContent = recoveryMessage
            ? 'Save as new order & print'
            : 'Save & print invoice';
    }
    function reset(preserveStoredDrafts) {
        if (!preserveStoredDrafts) removeMatchingDrafts(requestId);
        requestId = createWorkflowId();
        orderId = '';
        started = false;
        setRecovery('');
        timer = createEntryTimer();
        // Clearing the old form must not overwrite another tab's newer saved draft.
        resetting = true;
        try {
            options.reset();
        } finally {
            resetting = false;
        }
        form.querySelector('#workflow-suggestions').replaceChildren();
        saved = readPreviousDraft();
        updateResumePanel();
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
    form.addEventListener('workflow-start-new', function startNewOrder() {
        if (busy) return;
        try {
            var current = draft();
            if (hasEntries(current)) saveLocalDraft(current);
            reset(true);
        } catch (error) {
            status.textContent = 'Could not keep this draft: ' + error.message + '. Keep this page open.';
            notificationService.error(status.textContent);
        }
    });
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
        var printedEntries = entrySignature(current);
        if (!current.items.length) {
            notificationService.error('Add at least one product.');
            return;
        }
        var popup;
        try {
            // Reserve from the user's gesture before any asynchronous preparation.
            if (!saveOnly) popup = reserveInvoicePrintWindow();
            if (recoveryMessage) {
                // The labelled new-order action preserves every entry, but must
                // replace BOTH identifiers. Save locally before any cloud write
                // so a lost response/reload retries this same new order.
                current.requestId = createWorkflowId();
                current.orderId = '';
            }
            saveLocalDraft(current);
            requestId = current.requestId;
            orderId = current.orderId;
            setRecovery('');
            busy = true;
            Array.from(form.elements).forEach(function (element) {
                element.disabled = true;
            });
            status.textContent = 'Saving order and preparing invoice…';
            var result = await saveAndPrepareInvoice(current, {
                saveOnly: saveOnly,
                checkpoint: function (checkpoint) {
                    workflowLocalStore.write('draft', 'editor', checkpoint);
                    requestId = checkpoint.requestId;
                    orderId = checkpoint.orderId;
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
                    // A late print confirmation must not clear newer edits or
                    // another tab's recovery copy, even if they share an order ID.
                    removeMatchingDrafts(current.requestId, printedEntries);
                    if (form.isConnected && requestId === current.requestId) {
                        if (entrySignature(draft()) === printedEntries) reset(true);
                        else status.textContent = 'Printing recorded. Your newer entries are still here.';
                    }
                },
            });
            status.textContent =
                'Invoice ready in the print window. Confirm the paper there, or reopen printing here.';
        } catch (error) {
            if (error.code === 'invoice-draft-needs-new-order') setRecovery(error.message);
            if (popup && !popup.closed && !popup.document.getElementById('job-print')) {
                popup.document.title = 'Invoice needs attention';
                popup.document.body.textContent = error.message + ' Return to the editor to continue.';
                var returnButton = popup.document.createElement('button');
                returnButton.textContent = 'Return to editor';
                returnButton.style.cssText = 'display:block;margin-top:24px;padding:12px 20px;font:inherit;cursor:pointer';
                returnButton.onclick = function returnToEditor() {
                    window.focus();
                    popup.close();
                    if (form.isConnected) actions.querySelector('#workflow-print').focus();
                };
                popup.document.body.append(returnButton);
            }
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
    if (options.hasRepeatDraft) persist();
}
