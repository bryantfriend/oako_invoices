import { getGoogleSheetId, settingsService } from "./settingsService.js";

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
            const lineTotal = item.total || ((item.price || 0) * quantity);
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
            item.total || ((item.price || 0) * (item.adjustedQuantity !== undefined ? item.adjustedQuantity : item.quantity || 0)),
            invoice.status
        ]);
    },

    async postPayload(payload) {
        try {
            const settings = await settingsService.getInvoiceSettings();
            if (!settings.syncEnabled) {
                return { skipped: true };
            }

            const googleSheetId = getGoogleSheetId(settings.googleSheetId);
            const webhookUrl = String(settings.googleSheetsWebhookUrl || '').trim();
            if (!webhookUrl) {
                console.warn('Google Sheets sync is enabled but Google Sheets Webhook URL is not configured. A Sheet ID opens the sheet, but browser code still needs an Apps Script webhook to append rows.', {
                    googleSheetId,
                    payload
                });
                return { skipped: true, payload };
            }

            const response = await fetch(webhookUrl, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({
                    googleSheetId,
                    sheetId: googleSheetId,
                    ...payload
                })
            });

            if (response.type === 'opaque') return { success: true, opaque: true, payload };
            if (!response.ok) throw new Error(`Google Sheets sync failed with ${response.status}`);
            return { success: true, payload };
        } catch (error) {
            console.warn('Google Sheets sync failed without blocking invoice completion.', error);
            return { success: false, error };
        }
    },

    async postInvoiceRows(invoice) {
        const rows = this.buildRows(invoice);
        return this.postPayload({
            mode: 'append',
            entityType: 'invoice',
            invoiceId: invoice.id,
            rows
        });
    },

    async syncCompletedInvoice(invoice) {
        if (invoice.status !== 'completed') {
            return { skipped: true };
        }
        return this.postInvoiceRows(invoice);
    },

    async syncPrintedInvoice(invoice) {
        return this.postInvoiceRows({
            ...invoice,
            status: invoice.status || 'confirmed'
        });
    },

    async syncOrderLifecycle(order) {
        const rowObjects = this.buildOrderRows(order);
        if (rowObjects.length === 0) {
            return { skipped: true, reason: 'no_rows' };
        }

        return this.postPayload({
            mode: 'upsert',
            entityType: 'order',
            orderId: order.id,
            primaryKey: 'sheetRowKey',
            rowObjects,
            rows: rowObjects.map(row => row.values)
        });
    }
};
