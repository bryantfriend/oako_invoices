import { orderService } from "../services/orderService.js";
import { notificationService } from "../core/notificationService.js";

export const dashboardController = {
    async loadDashboard() {
        try {
            const orders = await orderService.getAllOrders();
            return {
                orders,
                metrics: this.calculateMetrics(orders)
            };
        } catch (error) {
            notificationService.error("Failed to load dashboard data");
            return { orders: [], metrics: {} };
        }
    },

    calculateMetrics(orders) {
        return {
            totalOrders: orders.length,
            pending: orders.filter(o => o.status === 'pending').length,
            draft: orders.filter(o => o.status === 'draft').length
        };
    }
};
