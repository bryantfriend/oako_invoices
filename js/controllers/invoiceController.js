import { invoiceService } from "../services/invoiceService.js";
import { notificationService } from "../core/notificationService.js";

export const invoiceController = {
    async loadInvoice(id) {
        try {
            return await invoiceService.getInvoice(id);
        } catch (error) {
            notificationService.error("Failed to load invoice");
            return null;
        }
    },

    async loadAllInvoices() {
        try {
            return await invoiceService.getAllInvoices();
        } catch (error) {
            notificationService.error("Failed to load invoices");
            return [];
        }
    },

    async generateForOrder(orderId) {
        try {
            const invoiceId = await invoiceService.createInvoice(orderId);
            return invoiceId;
        } catch (error) {
            notificationService.error("Failed to generate invoice");
            return null;
        }
    }
};
