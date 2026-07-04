import { orderService } from "../services/orderService.js";
import { notificationService } from "../core/notificationService.js";
import { router } from "../router.js";
import { ROUTES } from "../core/constants.js";
import { authService } from "../core/authService.js";
import { t } from "../core/i18n.js";
import { gamificationService } from "../services/gamificationService.js";
import sessionDataStore from "../services/sessionDataStore.js";
import { offlineStatusService } from "../services/offlineStatusService.js";
import { calculateOrderTotals, normalizeDefaultOrderPriceMode, normalizeOrderItemPricing } from "../core/pricing.js";

export const createOrderController = {
    async handleCreateOrder(formData) {
        // Validation handled by HTML5 or manual check
        if (!formData.customerName) {
            notificationService.error(t('val_required'));
            return;
        }

        if (!formData.items || formData.items.length === 0) {
            notificationService.error(t('msg_save_fail'));
            return;
        }

        const selectedPriceMode = normalizeDefaultOrderPriceMode(formData.selectedPriceMode);
        const items = formData.items.map(function(item) {
            return normalizeOrderItemPricing(item);
        });
        const totals = calculateOrderTotals(items);
        console.info('[PRICING] totals recalculated');

        const orderPayload = {
            customerName: formData.customerName,
            orderDate: formData.orderDate,
            notes: formData.notes,
            items: items,
            selectedPriceMode: selectedPriceMode,
            totalAmount: totals.totalAmount,
            subtotal: totals.subtotal,
            status: 'draft'
        };

        const user = authService.getCurrentUser();
        if (!user) {
            notificationService.error(t('login_fail'));
            return;
        }

        try {
            const wasCloudReachable = offlineStatusService.isOnline();
            console.info('[OFFLINE_ORDER] local validation passed');
            notificationService.info(wasCloudReachable ? 'Saving order...' : 'Saving locally...');

            const orderId = await orderService.createOrder(orderPayload, user.uid);
            const now = new Date();
            const localRecord = Object.assign({}, orderPayload, {
                id: orderId,
                createdBy: user.uid,
                createdAt: now,
                updatedAt: now,
                syncState: wasCloudReachable ? 'synced' : 'offline_created',
                localId: wasCloudReachable ? '' : orderId,
                serverId: wasCloudReachable ? orderId : null,
                syncStatus: wasCloudReachable ? 'synced' : 'pending',
                syncAction: wasCloudReachable ? '' : 'create',
                createdOffline: !wasCloudReachable,
                offlineCreated: !wasCloudReachable,
                localCreatedAt: now.getTime(),
                localUpdatedAt: now.getTime(),
                lastSyncAttemptAt: null,
                syncError: null
            });
            sessionDataStore.updateOrderRecord(orderId, localRecord, 'create-order');
            console.info('[OFFLINE_ORDER] added to memory cache');
            await gamificationService.awardAction('ordersCreated');
            if (wasCloudReachable) {
                notificationService.success(t('msg_save_success'));
            } else {
                console.info('[OFFLINE_ORDER] saved to Dexie/local queue');
                console.info('[OFFLINE_ORDER] pending sync');
                notificationService.success('Order saved offline. Will sync when connection returns.');
            }
            router.navigate(ROUTES.DASHBOARD);
        } catch (error) {
            notificationService.error(t('msg_save_fail'));
        }
    },

    async getLastOrderItems(customerName) {
        try {
            const lastOrder = await orderService.getLastOrderByCustomer(customerName);
            if (lastOrder && lastOrder.items) {
                return lastOrder.items;
            }
            return null;
        } catch (error) {
            console.warn("Could not fetch last order", error);
            return null;
        }
    },

    async getCustomerOrderHistory(customerName, limitCount = 8) {
        try {
            const orders = await orderService.getOrdersByCustomerName(customerName);
            return (orders || []).slice(0, limitCount);
        } catch (error) {
            console.warn("Could not fetch customer order history", error);
            return [];
        }
    }
};
