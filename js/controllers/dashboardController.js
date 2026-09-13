import sessionDataStore from "../services/sessionDataStore.js";
import { notificationService } from "../core/notificationService.js";
import { statsService } from "../services/statsService.js";
import { t } from "../core/i18n.js";
import { getAnalyticsStatus } from "../core/orderRecordHelpers.js";
import { productReconciliationService } from "../services/productReconciliationService.js";

function buildDashboardResult(loadResult, reconciliationError) {
    var result = loadResult || {};
    var extras = result.extras || {};
    // Match availability must not suppress order history or monetary statistics.
    var orders = reconciliationError ? result.records || [] : productReconciliationService.projectRecords(result.records || [], 'orders');

    return {
        orders: orders,
        returnOrders: orders,
        returnInvoices: reconciliationError ? extras.returnInvoices || [] : productReconciliationService.projectRecords(extras.returnInvoices || [], 'order-returns'),
        intelligenceSettings: extras.intelligenceSettings || {},
        metrics: dashboardController.calculateMetrics(orders),
        meta: Object.assign({}, result.meta || {}, { reconciliationUnavailable: Boolean(reconciliationError) })
    };
}

async function loadDashboardReconciliation(forceRefresh) {
    try {
        var context = await productReconciliationService.loadContext(null, null, forceRefresh);
        if (!context.products.length) {
            throw new Error('Product catalog is unavailable.');
        }
        return null;
    } catch (error) {
        console.warn('Historical product matches are unavailable; preserving Orders statistics.', error);
        return error;
    }
}

export const dashboardController = {
    getCachedDashboard: function() {
        if (!productReconciliationService.getContext().products.length) { return null; }
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
            var reconciliationError = await loadDashboardReconciliation(false);
            var result = await sessionDataStore.loadOrders(options || {});
            return buildDashboardResult(result, reconciliationError);
        } catch (error) {
            console.error("Dashboard Load Error:", error);
            notificationService.error(t('msg_load_fail'));
            return { orders: [], returnOrders: [], returnInvoices: [], metrics: {}, meta: { error: true } };
        }
    },

    async refreshDashboard(options) {
        try {
            var reconciliationError = await loadDashboardReconciliation(true);
            var result = await sessionDataStore.refreshOrders(options || {});
            return buildDashboardResult(result, reconciliationError);
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
            return ['confirmed', 'fulfilled', 'fullfilled'].includes(getAnalyticsStatus(order)) && (order.agingDays || 0) >= 14;
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

    getDailySales: function(orders) {
        return statsService.getDailySales(orders);
    },

    calculateMetrics(orders) {
        const confirmedStati = ['confirmed', 'fulfilled', 'fullfilled', 'paid'];
        const outstandingStati = ['confirmed', 'fulfilled', 'fullfilled'];

        return {
            totalOrders: orders.length,
            pending: orders.filter(function(order) { return getAnalyticsStatus(order) === 'pending'; }).length,
            draft: orders.filter(function(order) { return getAnalyticsStatus(order) === 'draft'; }).length,
            totalConfirmedAmount: orders
                .filter(function(order) { return confirmedStati.includes(getAnalyticsStatus(order)); })
                .reduce(function(sum, order) { return sum + (order.totalAmount || 0); }, 0),
            outstandingAmount: orders
                .filter(function(order) { return outstandingStati.includes(getAnalyticsStatus(order)); })
                .reduce(function(sum, order) { return sum + (order.totalAmount || 0); }, 0)
        };
    },

    loadStats(orders, period, revenueGranularity = 'day', returnInvoices = [], returnOrders = orders, intelligenceSettings = {}) {
        return statsService.getDashboardStats(orders, period, revenueGranularity, {
            invoices: returnInvoices,
            orders: returnOrders,
            intelligenceSettings: intelligenceSettings
        });
    },

    getTopProductsForCategory(orders, categoryId) {
        return statsService.getTopProductsForCategory(orders, categoryId);
    }
};
