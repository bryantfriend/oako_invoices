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

async function save(draft, session) {
    var record = normalizeWorkflowOrder(draft);
    var settings = await settingsService.getInvoiceSettings();
    record.storeId = settings.storeId || settings.companyId || 'KORG';
    var id = draft.orderId;
    if (id) {
        var existing = await orderService.getOrderById(id);
        if (!existing || existing.archived) throw new Error('The saved order is unavailable or archived.');
        var invoice = await invoiceService.getInvoiceByOrderId(id);
        if (invoice && !canEditInvoiceItems(invoice)) {
            // A recovered printed order is ready to reprint, not editable.
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
    var intent = saveIntent.createSaveAndPrepareInvoiceIntent(
        { id: session.uid, role: session.role },
        { draft: draft, saveOnly: safeOptions.saveOnly === true },
        {
            api: {
                getSession: getWorkflowSession,
                save: save,
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
        throw error;
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
