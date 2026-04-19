import { settingsService } from "./settingsService.js";

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

    async syncCompletedInvoice(invoice) {
        try {
            const settings = await settingsService.getInvoiceSettings();
            if (!settings.syncEnabled || invoice.status !== 'completed') {
                return { skipped: true };
            }

            const rows = this.buildRows(invoice);
            if (!settings.googleSheetsWebhookUrl) {
                console.warn('Google Sheets sync is enabled but googleSheetsWebhookUrl is not configured.', {
                    googleSheetId: settings.googleSheetId,
                    rows
                });
                return { skipped: true, rows };
            }

            const response = await fetch(settings.googleSheetsWebhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    googleSheetId: settings.googleSheetId,
                    rows
                })
            });

            if (!response.ok) throw new Error(`Google Sheets sync failed with ${response.status}`);
            return { success: true, rows };
        } catch (error) {
            console.warn('Google Sheets sync failed without blocking invoice completion.', error);
            return { success: false, error };
        }
    }
};
