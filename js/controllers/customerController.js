import { customerService } from "../services/customerService.js";
import { notificationService } from "../core/notificationService.js";
import { t } from "../core/i18n.js";
import { router } from "../router.js";
import { ROUTES } from "../core/constants.js";
import { gamificationService } from "../services/gamificationService.js";

export const customerController = {
    async loadAllCustomers() {
        try {
            return await customerService.getAllCustomers();
        } catch (error) {
            notificationService.error(t('msg_load_fail'));
            return [];
        }
    },

    async handleCreateCustomer(data) {
        try {
            if (!data.name) {
                notificationService.error(t('val_required'));
                return;
            }
            await customerService.createCustomer(data);
            await gamificationService.awardAction('customersCreated');
            notificationService.success(t('msg_save_success'));
            // Refresh or navigate logic dependent on where it's called
            return true;
        } catch (error) {
            notificationService.error(t('msg_save_fail'));
            return false;
        }
    },

    async handleUpdateCustomer(id, data) {
        try {
            await customerService.updateCustomer(id, data);
            notificationService.success(t('msg_update_success'));
            return true;
        } catch (error) {
            notificationService.error(t('msg_update_fail'));
            return false;
        }
    },

    async getCustomerById(id) {
        try {
            return await customerService.getCustomerById(id);
        } catch (error) {
            notificationService.error(t('msg_load_fail'));
            return null;
        }
    },


    // For auto-fill features
    async searchByName(term) {
        return await customerService.searchCustomers(term);
    },

    async archiveCustomer(id) {
        try {
            await customerService.updateCustomer(id, { archived: true });
            notificationService.success(t('msg_delete_success'));
        } catch (error) {
            notificationService.error(t('msg_delete_fail'));
        }
    },

    async handleDeleteCustomer(id) {
        try {
            await customerService.deleteCustomer(id);
            notificationService.success(t('msg_delete_success'));
            return true;
        } catch (error) {
            notificationService.error(t('msg_delete_fail'));
            return false;
        }
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
            notificationService.error(t('msg_load_fail'));
            return null;
        }
    }

};
