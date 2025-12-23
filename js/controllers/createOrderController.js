import { orderService } from "../services/orderService.js";
import { notificationService } from "../core/notificationService.js";
import { router } from "../router.js";
import { ROUTES } from "../core/constants.js";
import { authService } from "../core/authService.js";

export const createOrderController = {
    async handleCreateOrder(formData) {
        // Validation handled by HTML5 or manual check
        if (!formData.customerName) {
            notificationService.error("Customer Name is required");
            return;
        }

        if (!formData.items || formData.items.length === 0) {
            notificationService.error("Add at least one item");
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
            notes: formData.notes,
            items: items,
            totalAmount: totalAmount,
            status: 'draft'
        };

        const user = authService.getCurrentUser();
        if (!user) {
            notificationService.error("You must be logged in");
            return;
        }

        try {
            const orderId = await orderService.createOrder(orderPayload, user.uid);
            notificationService.success("Order created successfully");
            router.navigate(ROUTES.ORDER_DETAIL.replace(':id', orderId));
        } catch (error) {
            notificationService.error("Failed to create order");
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
