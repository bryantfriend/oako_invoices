import { invoiceService } from "../services/invoiceService.js";
import { notificationService } from "../core/notificationService.js";
import { t } from "../core/i18n.js";

export const invoiceController = {
    async loadInvoice(id) {
        try {
            return await invoiceService.getInvoice(id);
        } catch (error) {
            notificationService.error(t('msg_load_fail'));
            return null;
        }
    },

    async loadAllInvoices() {
        try {
            return await invoiceService.getWorkingInvoices();
        } catch (error) {
            notificationService.error(t('msg_load_fail'));
            return [];
        }
    },

    async loadInvoiceHistoryPage(limitCount) {
        try {
            return await invoiceService.getInvoiceHistoryPage(limitCount);
        } catch (error) {
            notificationService.error(t('msg_load_fail'));
            return [];
        }
    },

    async generateForOrder(orderId) {
        try {
            const invoiceId = await invoiceService.createInvoice(orderId);
            return invoiceId;
        } catch (error) {
            notificationService.error(t('msg_save_fail'));
            return null;
        }
    },

    async updateDate(id, newDate) {
        try {
            await invoiceService.updateInvoiceDate(id, newDate);
            notificationService.success(t('msg_update_success'));
            return true;
        } catch (error) {
            notificationService.error(t('msg_update_fail'));
            return false;
        }
    }
};
