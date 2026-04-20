import { customerService } from "../services/customerService.js";
import { notificationService } from "../core/notificationService.js";
import { t } from "../core/i18n.js";
import { router } from "../router.js";
import { ROUTES } from "../core/constants.js";
import { gamificationService } from "../services/gamificationService.js";

export const customerController = {
    generateCustomerPin() {
        return customerService.generateCustomerPin();
    },

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
            const lookupNames = [...new Set([customer.companyName, customer.name].filter(Boolean))];
            const orderGroups = await Promise.all(lookupNames.map(name => orderService.getOrdersByCustomerName(name).catch(() => [])));
            const orderMap = new Map();
            orderGroups.flat().forEach(order => orderMap.set(order.id, order));
            const orders = [...orderMap.values()].sort((a, b) => {
                const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || a.orderDate || 0);
                const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || b.orderDate || 0);
                return dateB - dateA;
            });

            // Calculate Stats
            const totalRevenue = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
            const totalOrders = orders.length;
            const lastOrderDate = orders.length > 0 ? (orders[0].orderDate || orders[0].createdAt) : null;
            const productTotals = orders.reduce((totals, order) => {
                (order.items || []).forEach(item => {
                    const key = item.productId || item.name;
                    if (!totals[key]) {
                        totals[key] = {
                            productId: item.productId || '',
                            name: item.name || item.productName || 'Product',
                            quantity: 0,
                            count: 0
                        };
                    }
                    totals[key].quantity += Number(item.adjustedQuantity !== undefined ? item.adjustedQuantity : item.quantity) || 0;
                    totals[key].count += 1;
                });
                return totals;
            }, {});
            const mostOrderedProducts = Object.values(productTotals)
                .sort((a, b) => b.quantity - a.quantity)
                .slice(0, 5);

            return {
                customer,
                orders,
                stats: {
                    totalRevenue,
                    totalOrders,
                    lastOrderDate
                },
                mostOrderedProducts
            };
        } catch (error) {
            console.error("Error loading customer detail:", error);
            notificationService.error(t('msg_load_fail'));
            return null;
        }
    }

};
