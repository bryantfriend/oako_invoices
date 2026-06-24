import sessionDataStore from "../services/sessionDataStore.js";
import { notificationService } from "../core/notificationService.js";
import { statsService } from "../services/statsService.js";
import { t } from "../core/i18n.js";

function buildDashboardResult(loadResult) {
    var result = loadResult || {};
    var extras = result.extras || {};
    var orders = result.records || [];

    return {
        orders: orders,
        returnOrders: extras.returnOrders || orders,
        returnInvoices: extras.returnInvoices || [],
        metrics: dashboardController.calculateMetrics(orders),
        meta: result.meta || {}
    };
}

export const dashboardController = {
    getCachedDashboard: function() {
        var snapshot = sessionDataStore.getOrdersSnapshot();
        if (!snapshot) {
            return null;
        }

        return buildDashboardResult({
            records: snapshot.records || [],
            extras: snapshot.extras || {},
            meta: {
                source: snapshot.source || 'memory',
                cacheHit: true,
                shouldRefresh: snapshot.shouldRefresh === true,
                revision: snapshot.revision || 0,
                loadedAt: snapshot.loadedAt || null,
                readCount: 0
            }
        });
    },

    shouldRefreshDashboard: function() {
        var snapshot = sessionDataStore.getOrdersSnapshot();
        if (!snapshot) {
            return true;
        }

        return snapshot.shouldRefresh === true;
    },

    async loadDashboard(options) {
        try {
            var result = await sessionDataStore.loadOrders(options || {});
            return buildDashboardResult(result);
        } catch (error) {
            console.error("Dashboard Load Error:", error);
            notificationService.error(t('msg_load_fail'));
            return { orders: [], returnOrders: [], returnInvoices: [], metrics: {}, meta: { error: true } };
        }
    },

    async refreshDashboard(options) {
        try {
            var result = await sessionDataStore.refreshOrders(options || {});
            return buildDashboardResult(result);
        } catch (error) {
            console.error("Dashboard Refresh Error:", error);
            return { orders: [], returnOrders: [], returnInvoices: [], metrics: {}, meta: { error: true } };
        }
    },

    updateCachedOrder: function(id, updates, reason) {
        sessionDataStore.updateOrderRecord(id, updates || {}, reason || 'order-mutation');
    },

    removeCachedOrder: function(id, reason) {
        sessionDataStore.removeOrderRecord(id, reason || 'order-remove');
    },

    invalidateOrdersCache: function(reason) {
        return sessionDataStore.invalidateOrdersCache(reason || 'orders-invalidated');
    },

    getRiskAlerts(orders) {
        const criticalOverdue = orders.filter(function(order) {
            return ['confirmed', 'fulfilled', 'fullfilled'].includes(order.status) && (order.agingDays || 0) >= 14;
        });

        if (criticalOverdue.length === 0) return null;

        const totalRisk = criticalOverdue.reduce(function(sum, order) {
            return sum + (order.totalAmount || 0);
        }, 0);
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
        const confirmedStati = ['confirmed', 'fulfilled', 'fullfilled', 'paid'];
        const outstandingStati = ['confirmed', 'fulfilled', 'fullfilled'];

        return {
            totalOrders: orders.length,
            pending: orders.filter(function(order) { return order.status === 'pending'; }).length,
            draft: orders.filter(function(order) { return order.status === 'draft'; }).length,
            totalConfirmedAmount: orders
                .filter(function(order) { return confirmedStati.includes(order.status); })
                .reduce(function(sum, order) { return sum + (order.totalAmount || 0); }, 0),
            outstandingAmount: orders
                .filter(function(order) { return outstandingStati.includes(order.status); })
                .reduce(function(sum, order) { return sum + (order.totalAmount || 0); }, 0)
        };
    },

    loadStats(orders, period, revenueGranularity = 'day', returnInvoices = [], returnOrders = orders) {
        return statsService.getDashboardStats(orders, period, revenueGranularity, {
            invoices: returnInvoices,
            orders: returnOrders
        });
    },

    getTopProductsForCategory(orders, categoryId) {
        return statsService.getTopProductsForCategory(orders, categoryId);
    }
};