import { customerService } from "../services/customerService.js";
import { notificationService } from "../core/notificationService.js";
import { router } from "../router.js";
import { ROUTES } from "../core/constants.js";

export const customerController = {
    async loadAllCustomers() {
        try {
            return await customerService.getAllCustomers();
        } catch (error) {
            notificationService.error("Failed to load customers");
            return [];
        }
    },

    async handleCreateCustomer(data) {
        try {
            if (!data.name) {
                notificationService.error("Customer name is required");
                return;
            }
            await customerService.createCustomer(data);
            notificationService.success("Customer created successfully");
            // Refresh or navigate logic dependent on where it's called
            return true;
        } catch (error) {
            notificationService.error("Failed to create customer");
            return false;
        }
    },

    async handleUpdateCustomer(id, data) {
        try {
            await customerService.updateCustomer(id, data);
            notificationService.success("Customer updated");
            return true;
        } catch (error) {
            notificationService.error("Failed to update customer");
            return false;
        }
    },

    async getCustomerById(id) {
        try {
            return await customerService.getCustomerById(id);
        } catch (error) {
            notificationService.error("Failed to load customer");
            return null;
        }
    },


    // For auto-fill features
    async searchByName(term) {
        return await customerService.searchCustomers(term);
    },

    async archiveCustomer(id) {
        await customerService.updateCustomer(id, { archived: true });
    },

    async loadCustomerDetail(id) {
        try {
            const customer = await customerService.getCustomerById(id);
            if (!customer) return null;

            // Fetch orders
            const { orderService } = await import("../services/orderService.js");
            const orders = await orderService.getOrdersByCustomerName(customer.name) || [];

            // Calculate Stats
            const totalRevenue = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
            const totalOrders = orders.length;
            const lastOrderDate = orders.length > 0 ? orders[0].orderDate : null;

            return {
                customer,
                orders,
                stats: {
                    totalRevenue,
                    totalOrders,
                    lastOrderDate
                }
            };
        } catch (error) {
            console.error("Error loading customer detail:", error);
            notificationService.error("Failed to load customer details");
            return null;
        }
    }

};
