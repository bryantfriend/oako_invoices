import { invoiceService } from "../services/invoiceService.js";
import { notificationService } from "../core/notificationService.js";
import { t } from "../core/i18n.js";
import { invoiceApprovalController } from "./invoiceApprovalController.js";

function getIntentErrorMessage(result, fallbackMessage) {
    if (!result) {
        return fallbackMessage;
    }

    if (result.reason) {
        return result.reason;
    }

    if (result.message) {
        return result.message;
    }

    if (result.errors && result.errors.length > 0) {
        return result.errors[0];
    }

    return fallbackMessage;
}

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

    async loadArchivedInvoices() {
        try {
            return await invoiceService.getArchivedInvoices();
        } catch (error) {
            notificationService.error('Failed to load archived invoices.');
            return [];
        }
    },

    async archiveInvoice(invoiceId) {
        try {
            const result = await invoiceService.archiveInvoice(invoiceId);
            if (!result || !result.ok) {
                throw new Error(getIntentErrorMessage(result, 'Failed to archive invoice.'));
            }
            notificationService.success('Invoice archived.');
            return true;
        } catch (error) {
            notificationService.error(error.message || 'Failed to archive invoice.');
            return false;
        }
    },

    async generateForOrder(orderId, orderSnapshot) {
        try {
            const invoiceId = await invoiceService.createInvoice(orderId, {}, orderSnapshot);
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
    },

    normalizeInvoiceItemsForEditing(invoice) {
        return invoiceService.normalizeInvoiceItemsForEditing(invoice);
    },

    recalculateInvoiceTotals(invoice) {
        return invoiceService.recalculateInvoiceTotals(invoice);
    },

    async addInvoiceItem(invoiceId, product, quantity = 1) {
        try {
            await invoiceService.addInvoiceItem(invoiceId, product, quantity);
            notificationService.success('Product added to invoice.');
            return true;
        } catch (error) {
            notificationService.error(error.message || t('msg_update_fail'));
            return false;
        }
    },

    async removeInvoiceItem(invoiceId, lineItemId) {
        try {
            await invoiceService.removeInvoiceItem(invoiceId, lineItemId);
            notificationService.success('Product removed from invoice.');
            return true;
        } catch (error) {
            notificationService.error(error.message || t('msg_update_fail'));
            return false;
        }
    },

    async updateInvoiceItemQuantity(invoiceId, lineItemId, quantity) {
        try {
            await invoiceService.updateInvoiceItemQuantity(invoiceId, lineItemId, quantity);
            notificationService.success('Invoice quantity updated.');
            return true;
        } catch (error) {
            notificationService.error(error.message || t('msg_update_fail'));
            return false;
        }
    },

    async updateStatus(invoiceId, status) {
        try {
            await invoiceService.updateInvoice(invoiceId, { status }, 'updateInvoiceStatus');
            notificationService.success(t('msg_update_success'));
            return true;
        } catch (error) {
            notificationService.error(error.message || t('msg_update_fail'));
            return false;
        }
    },

    async recordInvoiceReturn(invoiceId, returnPayload) {
        try {
            await invoiceService.recordInvoiceReturn(invoiceId, returnPayload);
            notificationService.success('Returned items recorded.');
            return true;
        } catch (error) {
            notificationService.error(error.message || t('msg_update_fail'));
            return false;
        }
    },

    async restoreArchivedInvoice(invoiceId) {
        try {
            const result = await invoiceService.restoreArchivedInvoice(invoiceId);
            if (!result || !result.ok) {
                throw new Error((result && (result.reason || result.message)) || 'Failed to restore invoice.');
            }
            notificationService.success('Invoice restored.');
            return true;
        } catch (error) {
            notificationService.error(error.message || 'Failed to restore invoice.');
            return false;
        }
    },

    async loadApprovalLink(invoiceId) {
        return invoiceApprovalController.loadLatestApprovalLink(invoiceId);
    },

    async generateApprovalLink(invoiceId) {
        return invoiceApprovalController.generateApprovalLink(invoiceId);
    },

    buildApprovalUrl(token) {
        return invoiceApprovalController.buildApprovalUrl(token);
    },

    getApprovalDisplayStatus(approvalLink) {
        return invoiceApprovalController.getDisplayStatus(approvalLink);
    }
};
