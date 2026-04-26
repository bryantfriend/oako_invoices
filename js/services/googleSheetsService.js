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

export const googleSheetsService = {
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

    async postInvoiceRows(invoice) {
        try {
            const settings = await settingsService.getInvoiceSettings();
            if (!settings.syncEnabled) {
                return { skipped: true };
            }

            const rows = this.buildRows(invoice);
            const googleSheetId = getGoogleSheetId(settings.googleSheetId);
            const webhookUrl = String(settings.googleSheetsWebhookUrl || '').trim();
            if (!webhookUrl) {
                console.warn('Google Sheets sync is enabled but Google Sheets Webhook URL is not configured. A Sheet ID opens the sheet, but browser code still needs an Apps Script webhook to append rows.', {
                    googleSheetId,
                    rows
                });
                return { skipped: true, rows };
            }

            const response = await fetch(webhookUrl, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({
                    googleSheetId,
                    sheetId: googleSheetId,
                    invoiceId: invoice.id,
                    rows
                })
            });

            if (response.type === 'opaque') return { success: true, opaque: true, rows };
            if (!response.ok) throw new Error(`Google Sheets sync failed with ${response.status}`);
            return { success: true, rows };
        } catch (error) {
            console.warn('Google Sheets sync failed without blocking invoice completion.', error);
            return { success: false, error };
        }
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
    }
};
