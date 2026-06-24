import { orderService } from "../services/orderService.js";
import { notificationService } from "../core/notificationService.js";
import { router } from "../router.js";
import { ROUTES } from "../core/constants.js";
import { authService } from "../core/authService.js";
import { t } from "../core/i18n.js";
import { gamificationService } from "../services/gamificationService.js";
import sessionDataStore from "../services/sessionDataStore.js";

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
            const orderId = await orderService.createOrder(orderPayload, user.uid);
            sessionDataStore.updateOrderRecord(orderId, Object.assign({}, orderPayload, { id: orderId, createdBy: user.uid, createdAt: new Date(), updatedAt: new Date() }), 'create-order');
            await gamificationService.awardAction('ordersCreated');
            notificationService.success(t('msg_save_success'));
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
