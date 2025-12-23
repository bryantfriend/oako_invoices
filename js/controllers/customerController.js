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

    // For auto-fill features
    async searchByName(term) {
        return await customerService.searchCustomers(term);
    }
};
