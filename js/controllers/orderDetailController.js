import { orderService } from "../services/orderService.js";
import { notificationService } from "../core/notificationService.js";
import { ORDER_STATUS } from "../core/constants.js";
import { t } from "../core/i18n.js";

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
            notificationService.success(t('msg_update_success'));
            return true;
        } catch (error) {
            notificationService.error(t('msg_update_fail'));
            return false;
        }
    },

    async updateQuantities(id, items) {
        try {
            // Update items with adjusted quantities
            await orderService.updateOrder(id, { items });
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
