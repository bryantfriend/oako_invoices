import { orderService } from './orderService.js';
import { invoiceService } from './invoiceService.js';
import sessionDataStore from './sessionDataStore.js';
import { settingsService } from './settingsService.js';
import { normalizeWorkflowOrder } from '../core/invoiceProductivity.js';
import { workflowLocalStore } from './workflowLocalStore.js';
import { getWorkflowSession, queueWorkflowEffect } from './workflowEffectsService.js';
import { canEditInvoiceItems } from '../core/invoiceWorkflow.js';
import pipeline from '../ICF/engine/pipeline.js';
import saveIntent from '../ICF/Intents/SaveAndPrepareInvoiceIntent.js';
import batchIntent from '../ICF/Intents/PrepareInvoiceBatchIntent.js';
import { getLocalDateKey } from './operationsPlanningService.js';

function checkResult(result) {
    if (!result || !result.ok)
        throw new Error(
            result
                ? (result.errors || [result.reason || 'Invoice workflow failed.']).join(' ')
                : 'Invoice workflow failed.',
        );
    return result.data;
}

function newOrderRequired(message) {
    var error = new Error(message + ' Your entries are safe. Save them as a new order to continue.');
    error.code = 'invoice-draft-needs-new-order';
    return error;
}

function invoiceEntrySignature(source) {
    var record = normalizeWorkflowOrder(source);
    return JSON.stringify({
        customerName: record.customerName,
        orderDate: getLocalDateKey(record.orderDate),
        notes: record.notes,
        items: record.items.map(function savedItemFields(item) {
            return [item.productId || item.id || item.name, item.quantity, item.unitPrice];
        }),
    });
}

async function save(draft, session) {
    var record = normalizeWorkflowOrder(draft);
    var settings = await settingsService.getInvoiceSettings();
    record.storeId = settings.storeId || settings.companyId || 'KORG';
    var id = draft.orderId;
    if (id) {
        var existing = await orderService.getOrderById(id);
        // A confirmed missing/archived record needs an explicit new-order action.
        // Read failures still throw normally, retaining the identity for a safe retry.
        if (!existing) throw newOrderRequired('The previously saved order no longer exists.');
        if (existing.archived) throw newOrderRequired('The previously saved order was archived.');
        if (
            record.customerName !== String(existing.customerName || '').trim() ||
            getLocalDateKey(record.orderDate) !== getLocalDateKey(existing.orderDate)
        ) {
            throw newOrderRequired('The customer or delivery date differs from the saved order.');
        }
        var invoice = await invoiceService.getInvoiceByOrderId(id);
        if (invoice && invoice.archived) throw newOrderRequired('The saved invoice was archived.');
        if (invoice && (invoice.isPrinted || !canEditInvoiceItems(invoice))) {
            // Reprinting is safe only when the paper represents the current entries.
            if (invoiceEntrySignature(record) !== invoiceEntrySignature(Object.assign({}, existing, invoice))) {
                throw newOrderRequired('These entries differ from the saved, locked invoice.');
            }
            return existing;
        }
        record.status = existing.status;
        await orderService.updateOrderFromDailyOrders(id, record, existing);
        if (invoice) await invoiceService.syncInvoiceWithOrder(id, invoice);
    } else {
        // Stable IDs survive lost responses and a browser restart, including offline creation.
        id = 'desk-' + draft.requestId;
        queueWorkflowEffect('reward', id, 'ordersCreated');
        var created = await orderService.createOrder(record, session.uid, {
            requestId: draft.requestId,
            returnRecord: true,
        });
        id = created.id;
        if (created.workflowReused) {
            draft.orderId = id;
            return save(draft, session);
        }
        record = Object.assign({}, record, created);
    }
    record = Object.assign({}, record, { id: id, createdBy: session.uid, updatedAt: new Date() });
    sessionDataStore.updateOrderRecord(id, record, 'invoice-desk');
    return record;
}

async function prepare(order) {
    var result = checkResult(
        await invoiceService.preparePrintableInvoice(order.id, order, {
            preferCachedDependencies: true,
            source: 'invoice-desk',
        }),
    );
    if (!result.invoice)
        throw new Error('The invoice was saved but its preview is unavailable. Retry preparation.');
    if (result.invoice.workflowCreateRewardEligible)
        queueWorkflowEffect('reward', result.invoiceId, 'invoicesCreated');
    sessionDataStore.updateInvoiceRecord(result.invoiceId, result.invoice, 'invoice-desk');
    sessionDataStore.updateOrderRecord(
        order.id,
        { invoiceGenerated: true, invoiceId: result.invoiceId },
        'invoice-desk',
    );
    return result.invoice;
}

export async function saveAndPrepareInvoice(draft, options) {
    var safeOptions = options || {};
    var session = getWorkflowSession();
    var started = Date.now();
    var saveError = null;
    async function saveWithRecovery(currentDraft, currentSession) {
        try {
            return await save(currentDraft, currentSession);
        } catch (error) {
            // The shared pipeline intentionally reduces exceptions to messages.
            // Preserve this action's typed recovery information for its editor.
            saveError = error;
            throw error;
        }
    }
    var intent = saveIntent.createSaveAndPrepareInvoiceIntent(
        { id: session.uid, role: session.role },
        { draft: draft, saveOnly: safeOptions.saveOnly === true },
        {
            api: {
                getSession: getWorkflowSession,
                save: saveWithRecovery,
                prepare: prepare,
                checkpoint: safeOptions.checkpoint,
            },
        },
    );
    try {
        var result = checkResult(await pipeline.run(intent));
        if (!safeOptions.saveOnly) {
            var measurement = { durationMs: Date.now() - started };
            if (Number.isFinite(draft.entryMs)) measurement.entryMs = draft.entryMs;
            workflowLocalStore.event('prepared', measurement);
        }
        return result;
    } catch (error) {
        workflowLocalStore.event('preparation_failed', { durationMs: Date.now() - started });
        throw saveError || error;
    }
}

export async function prepareDailyInvoiceBatch(rows, checkpoint) {
    var session = getWorkflowSession();
    var started = Date.now();
    var intent = batchIntent.createPrepareInvoiceBatchIntent(
        { id: session.uid, role: session.role },
        { rows: rows },
        {
            api: {
                getSession: getWorkflowSession,
                prepareRow: async function (row) {
                    if (!row.orderId && !row.existingOrderId) {
                        var history = await orderService.getOrdersByCustomerName(row.customerName);
                        var currentOrder = history.find(function (order) {
                            return (
                                !order.archived &&
                                order.status !== 'cancelled' &&
                                getLocalDateKey(order.orderDate) === row.orderDate
                            );
                        });
                        if (currentOrder) {
                            if (
                                currentOrder.id === 'desk-' + row.requestId &&
                                currentOrder.createdBy === session.uid
                            ) {
                                row.orderId = currentOrder.id;
                            } else {
                                row.existingOrderId = currentOrder.id;
                                row.items = currentOrder.items.map(function (item) {
                                    return Object.assign({}, item);
                                });
                                throw new Error(
                                    'An order was saved for this customer and date since the worksheet was loaded. Review its saved quantities, then retry to prepare that order.',
                                );
                            }
                        }
                    }
                    if (row.existingOrderId) {
                        var existing = await orderService.getOrderById(row.orderId || row.existingOrderId);
                        if (!existing || existing.archived)
                            throw new Error('The selected existing order is no longer available.');
                        return { order: existing, invoice: await prepare(existing) };
                    }
                    return saveAndPrepareInvoice(row, {
                        checkpoint: async function () {
                            await checkpoint(rows);
                        },
                    });
                },
                checkpointBatch: checkpoint,
            },
        },
    );
    var result = checkResult(await pipeline.run(intent));
    workflowLocalStore.event('batch', {
        durationMs: Date.now() - started,
        count: result.completed.length,
        failed: result.failed.length,
    });
    return result;
}
