import { orderService } from "../services/orderService.js";
import { customerService } from "../services/customerService.js";
import { notificationService } from "../core/notificationService.js";
import { statsService } from "../services/statsService.js";

export const dashboardController = {
    async loadDashboard() {
        try {
            const [orders, customers] = await Promise.all([
                orderService.getAllOrders(),
                customerService.getAllCustomers()
            ]);

            // Create a lookup map for customer categories
            const categoryMap = {};
            customers.forEach(c => {
                const name = (c.companyName || c.name || "").toLowerCase().trim();
                if (name) categoryMap[name] = c.category || 'C';
            });

            // Map category back to orders and calculate aging
            const now = new Date();
            const ordersWithCategory = orders.map(order => {
                // Priority: orderDate (user-set date) > createdAt (system date)
                let date;
                if (order.orderDate) {
                    date = new Date(order.orderDate);
                } else if (order.createdAt?.toDate) {
                    date = order.createdAt.toDate();
                } else if (order.createdAt) {
                    date = new Date(order.createdAt);
                } else {
                    date = now;
                }

                // Ensure date is valid for aging calculation
                const timestamp = isNaN(date.getTime()) ? now.getTime() : date.getTime();
                const diffDays = Math.floor((now.getTime() - timestamp) / (1000 * 60 * 60 * 24));

                return {
                    ...order,
                    customerCategory: categoryMap[(order.customerName || "").toLowerCase().trim()] || 'C',
                    agingDays: Math.max(0, diffDays),
                    isOutstanding: order.status === 'confirmed' || order.status === 'fulfilled'
                };
            });

            return {
                orders: ordersWithCategory,
                metrics: this.calculateMetrics(ordersWithCategory)
            };
        } catch (error) {
            notificationService.error("Failed to load dashboard data");
            return { orders: [], metrics: {} };
        }
    },

    getRiskAlerts(orders) {
        const criticalOverdue = orders.filter(o =>
            ['confirmed', 'fulfilled'].includes(o.status) && (o.agingDays || 0) >= 14
        );

        if (criticalOverdue.length === 0) return null;

        const totalRisk = criticalOverdue.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
        return {
            count: criticalOverdue.length,
            amount: totalRisk,
            label: `${criticalOverdue.length} invoices overdue >14 days · ${totalRisk} сом at risk`
        };
    },

    getPredictiveSignals(orders) {
        return statsService.getPredictiveSignals(orders);
    },

    calculateMetrics(orders) {
        const confirmedStati = ['confirmed', 'fulfilled', 'paid'];
        const outstandingStati = ['confirmed', 'fulfilled'];

        return {
            totalOrders: orders.length,
            pending: orders.filter(o => o.status === 'pending').length,
            draft: orders.filter(o => o.status === 'draft').length,
            totalConfirmedAmount: orders
                .filter(o => confirmedStati.includes(o.status))
                .reduce((sum, o) => sum + (o.totalAmount || 0), 0),
            outstandingAmount: orders
                .filter(o => outstandingStati.includes(o.status))
                .reduce((sum, o) => sum + (o.totalAmount || 0), 0)
        };
    },

    loadStats(orders, period) {
        return statsService.getDashboardStats(orders, period);
    },

    getRiskAlerts(orders) {
        const criticalOverdue = orders.filter(o =>
            ['confirmed', 'fulfilled'].includes(o.status) && (o.agingDays || 0) >= 14
        );

        if (criticalOverdue.length === 0) return null;

        const totalRisk = criticalOverdue.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
        return {
            count: criticalOverdue.length,
            amount: totalRisk,
            label: `${criticalOverdue.length} invoices overdue >14 days · ${totalRisk} сом at risk`
        };
    }
};
