import { orderService } from "../services/orderService.js";
import { notificationService } from "../core/notificationService.js";
import { ORDER_STATUS } from "../core/constants.js";

export const orderDetailController = {
    async loadOrder(id) {
        try {
            const order = await orderService.getOrderById(id);
            if (!order) {
                notificationService.error("Order not found");
                return null;
            }
            return order;
        } catch (error) {
            notificationService.error("Failed to load order");
            return null;
        }
    },

    async updateStatus(id, newStatus) {
        try {
            await orderService.updateOrderStatus(id, newStatus);
            notificationService.success(`Order status updated to ${newStatus}`);
            return true;
        } catch (error) {
            notificationService.error("Failed to update status");
            return false;
        }
    },

    async updateQuantities(id, items) {
        try {
            // Update items with adjusted quantities
            await orderService.updateOrder(id, { items });
            notificationService.success("Quantities updated");
            return true;
        } catch (error) {
            notificationService.error("Failed to update quantities");
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
            notificationService.success("Notes updated");
            return true;
        } catch (error) {
            notificationService.error("Failed to update notes");
            return false;
        }
    }
};
