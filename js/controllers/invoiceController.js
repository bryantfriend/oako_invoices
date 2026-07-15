import { invoiceService } from "../services/invoiceService.js";
import { notificationService } from "../core/notificationService.js";
import { t } from "../core/i18n.js";
import { invoiceApprovalController } from "./invoiceApprovalController.js";
import sessionDataStore from "../services/sessionDataStore.js";

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

    async loadInvoiceList(options) {
        try {
            var result = await sessionDataStore.loadInvoices(options || {});
            var extras = result.extras || {};
            return {
                invoices: result.records || [],
                orders: extras.orders || [],
                invoiceSettings: extras.invoiceSettings || {},
                meta: result.meta || {}
            };
        } catch (error) {
            notificationService.error(t('msg_load_fail'));
            return { invoices: [], orders: [], invoiceSettings: {}, meta: { error: true } };
        }
    },

    getCachedInvoiceList() {
        var snapshot = sessionDataStore.getInvoicesSnapshot();
        if (!snapshot) {
            return null;
        }
        var extras = snapshot.extras || {};
        return {
            invoices: snapshot.records || [],
            orders: extras.orders || [],
            invoiceSettings: extras.invoiceSettings || {},
            meta: {
                source: snapshot.source || 'memory',
                cacheHit: true,
                shouldRefresh: snapshot.shouldRefresh === true,
                revision: snapshot.revision || 0,
                loadedAt: snapshot.loadedAt || null,
                readCount: 0
            }
        };
    },

    getCachedInvoice(id) {
        var snapshot = sessionDataStore.getInvoicesSnapshot();
        var records = snapshot && Array.isArray(snapshot.records) ? snapshot.records : [];
        var invoice = records.find(function(record) {
            return record && record.id === id;
        });
        return invoice ? Object.assign({}, invoice) : null;
    },

    getCachedInvoiceSettings() {
        var snapshot = sessionDataStore.getInvoicesSnapshot();
        var settings = snapshot && snapshot.extras ? snapshot.extras.invoiceSettings : null;
        return settings ? Object.assign({}, settings) : null;
    },
    async refreshInvoiceList(options) {
        try {
            var result = await sessionDataStore.refreshInvoices(options || {});
            var extras = result.extras || {};
            return {
                invoices: result.records || [],
                orders: extras.orders || [],
                invoiceSettings: extras.invoiceSettings || {},
                meta: result.meta || {}
            };
        } catch (error) {
            console.warn('Invoice background refresh failed.', error);
            return { invoices: [], orders: [], invoiceSettings: {}, meta: { error: true } };
        }
    },

    async loadAllInvoices() {
        var result = await this.loadInvoiceList({ source: 'invoice-controller' });
        return result.invoices || [];
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
            sessionDataStore.removeInvoiceRecord(invoiceId, 'archive-invoice');
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
            try {
                const createdInvoice = await invoiceService.getInvoice(invoiceId);
                if (createdInvoice) {
                    sessionDataStore.updateInvoiceRecord(invoiceId, createdInvoice, 'create-invoice');
                } else {
                    await sessionDataStore.invalidateInvoicesCache('create-invoice-missing-record');
                }
            } catch (cacheError) {
                console.warn('Created invoice could not be seeded into the session cache.', cacheError);
                await sessionDataStore.invalidateInvoicesCache('create-invoice-cache-fallback');
            }
            return invoiceId;
        } catch (error) {
            notificationService.error(t('msg_save_fail'));
            return null;
        }
    },

    async updateDate(id, newDate) {
        try {
            await invoiceService.updateInvoiceDate(id, newDate);
            sessionDataStore.updateInvoiceRecord(id, { createdAt: new Date(newDate + 'T12:00:00'), dueDate: new Date(newDate + 'T12:00:00') }, 'update-invoice-date');
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

    buildInvoiceItemFromProduct(product, quantity = 1) {
        return invoiceService.buildInvoiceItemFromProduct(product, quantity);
    },

    recalculateInvoiceTotals(invoice) {
        return invoiceService.recalculateInvoiceTotals(invoice);
    },

    async saveInvoiceItems(invoiceId, items) {
        try {
            await invoiceService.saveInvoiceItems(invoiceId, items);
            await sessionDataStore.invalidateInvoicesCache('save-invoice-items');
            notificationService.success('Invoice items updated.');
            return true;
        } catch (error) {
            notificationService.error(error.message || t('msg_update_fail'));
            return false;
        }
    },

    async addInvoiceItem(invoiceId, product, quantity = 1) {
        try {
            await invoiceService.addInvoiceItem(invoiceId, product, quantity);
            await sessionDataStore.invalidateInvoicesCache('add-invoice-item');
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
            await sessionDataStore.invalidateInvoicesCache('remove-invoice-item');
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
            await sessionDataStore.invalidateInvoicesCache('update-invoice-quantity');
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
            sessionDataStore.updateInvoiceRecord(invoiceId, { status: status, updatedAt: new Date() }, 'update-invoice-status');
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
            await sessionDataStore.invalidateInvoicesCache('record-invoice-return');
            await sessionDataStore.invalidateOrdersCache('record-invoice-return');
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
            await sessionDataStore.invalidateInvoicesCache('restore-archived-invoice');
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
