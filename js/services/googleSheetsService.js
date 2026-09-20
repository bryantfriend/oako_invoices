import { getGoogleSheetId, settingsService } from "./settingsService.js";
import { getOrderItemUnitPrice } from "../core/pricing.js";
import { auth } from '../core/firebase.js';
import { syncSupportService } from './syncSupportService.js';

async function recordSheetsIssue(payload, code, message, actorId) {
    await syncSupportService.recordIssue({
        source: 'sheets', id: payload.orderId || payload.invoiceId || 'configuration',
        entityId: payload.orderId || payload.invoiceId, entityType: payload.entityType,
        action: payload.mode, status: 'needs_review', errorCode: code, message: message
    }, actorId);
}

function toIso(value) {
    if (!value) return '';
    if (value.toDate) return value.toDate().toISOString();
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function getReturnQuantity(invoice, item) {
    if (item.returnQuantity !== undefined) return item.returnQuantity || 0;
    const returnItem = (invoice.returnItems || []).find(entry => entry.productId === item.productId);
    return returnItem?.quantity || 0;
}

function getLineQuantity(item = {}) {
    return Number(item.adjustedQuantity !== undefined ? item.adjustedQuantity : item.quantity) || 0;
}

function getOrderReturnQuantity(order = {}, item = {}, index = 0) {
    if (item.returnQuantity !== undefined) return Number(item.returnQuantity) || 0;
    const orderReturnItem = (order.returnItems || []).find(entry => entry.productId === (item.productId || item.id || `${index}`));
    return Number(orderReturnItem?.quantity) || 0;
}

export const googleSheetsService = {
    buildOrderRows(order, options = {}) {
        const items = order.items || [];
        const partnerName = order.partnerName || order.customerName || '';
        const partnerCategory = order.partnerCategory || order.customerCategory || '';
        const orderDate = toIso(order.orderDate || order.createdAt);
        const updatedAt = toIso(order.updatedAt || new Date());

        return items.map((item, index) => {
            const productId = item.productId || item.id || `line-${index + 1}`;
            const quantity = getLineQuantity(item);
            const returnQuantity = getOrderReturnQuantity(order, item, index);
            const lineTotal = item.total || (getOrderItemUnitPrice(item) * quantity);
            const sourceId = order.id;

            return {
                sheetRowKey: `${sourceId}::${productId}`,
                values: [
                    sourceId,
                    order.storeId || '',
                    partnerCategory,
                    partnerName,
                    item.name || item.productName || item.displayName || 'Product',
                    quantity,
                    orderDate,
                    updatedAt,
                    returnQuantity,
                    lineTotal,
                    order.status || options.status || 'draft'
                ]
            };
        });
    },

    buildRows(invoice) {
        return (invoice.items || []).map(item => [
            invoice.id,
            invoice.storeId || '',
            invoice.partnerCategory || '',
            invoice.partnerName || invoice.customerName || '',
            item.name || item.productName || item.displayName || 'Product',
            item.adjustedQuantity !== undefined ? item.adjustedQuantity : item.quantity,
            toIso(invoice.orderDate || invoice.createdAt),
            toIso(invoice.updatedAt || new Date()),
            getReturnQuantity(invoice, item),
            item.total || (getOrderItemUnitPrice(item) * (item.adjustedQuantity !== undefined ? item.adjustedQuantity : item.quantity || 0)),
            invoice.status
        ]);
    },

    async postPayload(payload) {
        var actorId = auth.currentUser ? auth.currentUser.uid : '';
        var requestStarted = false;
        var timeoutId;
        try {
            const settings = await settingsService.getInvoiceSettings();
            if (!settings.syncEnabled) {
                return { skipped: true };
            }

            const googleSheetId = getGoogleSheetId(settings.googleSheetId);
            const webhookUrl = String(settings.googleSheetsWebhookUrl || '').trim();
            if (!webhookUrl) {
                var setupError = new Error('Google Sheets sync is enabled but its webhook URL is missing. Configure it in Settings.');
                setupError.code = 'sheets_configuration_required';
                throw setupError;
            }

            var controller = new AbortController();
            timeoutId = setTimeout(function() { controller.abort(); }, 20000);
            requestStarted = true;
            const response = await fetch(webhookUrl, {
                signal: controller.signal,
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({
                    googleSheetId,
                    sheetId: googleSheetId,
                    ...payload
                })
            });

            if (response.type === 'opaque') {
                var message = 'The Sheets request was sent, but the endpoint does not provide a readable receipt. Check the destination before retrying; automatic resend is paused to avoid duplicates.';
                await recordSheetsIssue(payload, 'sheets_delivery_unconfirmed', message, actorId);
                return { success: true, confirmed: false, needsReview: true, code: 'sheets_delivery_unconfirmed', message: message };
            }
            if (!response.ok) throw new Error(`Google Sheets sync failed with ${response.status}`);
            // A transport response alone is not proof that rows were committed.
            var receipt = await response.json();
            if (!receipt || receipt.success !== true || receipt.entityId !== (payload.orderId || payload.invoiceId) || (payload.deliveryId && receipt.deliveryId !== payload.deliveryId)) {
                var receiptError = new Error('The Sheets endpoint did not confirm the saved entity. Check its response contract before retrying.');
                receiptError.code = 'sheets_receipt_required';
                throw receiptError;
            }
            await syncSupportService.recordIssue({
                source: 'sheets', id: payload.orderId || payload.invoiceId,
                entityId: payload.orderId || payload.invoiceId, entityType: payload.entityType,
                action: payload.mode, status: 'acknowledged', needsReview: false,
                message: 'The endpoint confirmed this entity was saved.'
            }, actorId);
            return { success: true, confirmed: true };
        } catch (error) {
            var errorCode = error.code || (requestStarted ? 'sheets_delivery_uncertain' : 'sheets_setup_failed');
            await recordSheetsIssue(payload, errorCode, error.message, actorId);
            return { success: false, error: error, needsReview: true, code: errorCode, message: error.message };
        } finally {
            clearTimeout(timeoutId);
        }
    },

    async postInvoiceRows(invoice, options) {
        const rows = this.buildRows(invoice);
        return this.postPayload({
            mode: 'append',
            entityType: 'invoice',
            invoiceId: invoice.id,
            deliveryId: options && options.deliveryId ? options.deliveryId : '',
            rows
        });
    },

    async syncCompletedInvoice(invoice, options) {
        if (invoice.status !== 'completed' && invoice.status !== 'fulfilled') {
            return { skipped: true };
        }
        return this.postInvoiceRows(invoice, options);
    },

    async syncPrintedInvoice(invoice) {
        return this.postInvoiceRows({
            ...invoice,
            status: invoice.status || 'confirmed'
        });
    },

    async syncOrderLifecycle(order, options) {
        const rowObjects = this.buildOrderRows(order);
        if (rowObjects.length === 0) {
            return { skipped: true, reason: 'no_rows' };
        }

        return this.postPayload({
            mode: 'upsert',
            entityType: 'order',
            orderId: order.id,
            deliveryId: options && options.deliveryId ? options.deliveryId : '',
            primaryKey: 'sheetRowKey',
            rowObjects,
            rows: rowObjects.map(row => row.values)
        });
    }
};
