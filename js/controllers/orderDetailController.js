import { orderService } from "../services/orderService.js";
import { invoiceService } from "../services/invoiceService.js";
import { notificationService } from "../core/notificationService.js";
import { ORDER_STATUS } from "../core/constants.js";
import { t } from "../core/i18n.js";
import { gamificationService } from "../services/gamificationService.js";

export const orderDetailController = {
    async loadOrder(id) {
        try {
            const order = await orderService.getOrderById(id);
            if (!order) {
                notificationService.error(t('msg_load_fail'));
                return null;
            }
            return order;
        } catch (error) {
            notificationService.error(t('msg_load_fail'));
            return null;
        }
    },

    async updateStatus(id, newStatus) {
        try {
            await orderService.updateOrderStatus(id, newStatus);
            if (newStatus === ORDER_STATUS.FULFILLED) {
                await gamificationService.awardAction('ordersFulfilled');
            }
            if (newStatus === ORDER_STATUS.PAID) {
                await gamificationService.awardAction('ordersPaid');
            }
            notificationService.success(t('msg_update_success'));
            return true;
        } catch (error) {
            notificationService.error(t('msg_update_fail'));
            return false;
        }
    },

    async updateQuantities(id, items) {
        try {
            const totalAmount = items.reduce((sum, item) => {
                const qty = item.adjustedQuantity !== undefined ? item.adjustedQuantity : item.quantity;
                return sum + (qty * (item.price || 0));
            }, 0);
            // Update items with adjusted quantities and the new totalAmount
            await orderService.updateOrder(id, { items, totalAmount });
            await invoiceService.syncInvoiceWithOrder(id).catch(() => null);
            notificationService.success(t('msg_update_success'));
            return true;
        } catch (error) {
            notificationService.error(t('msg_update_fail'));
            return false;
        }
    },

    async generateInvoice(id) {
        // Validation: Order must be confirmed
        // Then navigate to invoice view or trigger generation
        // For now, assume it navigates
        return true;
    },

    async updateNotes(id, notes) {
        try {
            await orderService.updateOrder(id, { notes });
            notificationService.success(t('msg_update_success'));
            return true;
        } catch (error) {
            notificationService.error(t('msg_update_fail'));
            return false;
        }
    }
};
