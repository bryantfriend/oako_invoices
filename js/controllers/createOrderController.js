import { orderService } from "../services/orderService.js";
import { notificationService } from "../core/notificationService.js";
import { router } from "../router.js";
import { ROUTES } from "../core/constants.js";
import { authService } from "../core/authService.js";
import { t } from "../core/i18n.js";
import { gamificationService } from "../services/gamificationService.js";
import sessionDataStore from "../services/sessionDataStore.js";
import { offlineStatusService } from "../services/offlineStatusService.js";

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

        // Calculate totals
        const items = formData.items.map(item => ({
            ...item,
            quantity: parseInt(item.quantity) || 0,
            price: parseFloat(item.price) || 0,
            total: (parseInt(item.quantity) || 0) * (parseFloat(item.price) || 0)
        }));

        const totalAmount = items.reduce((sum, item) => sum + item.total, 0);

        const orderPayload = {
            customerName: formData.customerName,
            orderDate: formData.orderDate,
            notes: formData.notes,
            items: items,
            totalAmount: totalAmount,
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
    }
};
