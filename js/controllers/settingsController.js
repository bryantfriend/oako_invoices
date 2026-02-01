import { settingsService } from "../services/settingsService.js";
import { notificationService } from "../core/notificationService.js";

export const settingsController = {
    async loadSettings() {
        try {
            return await settingsService.getInvoiceSettings();
        } catch (error) {
            notificationService.error("Failed to load settings");
            return null;
        }
    },

    async updateSettings(data) {
        try {
            await settingsService.updateInvoiceSettings(data);
            notificationService.success("Settings updated successfully");
            return true;
        } catch (error) {
            notificationService.error("Failed to update settings");
            return false;
        }
    },

    async handleUploadLogo(file) {
        try {
            return await settingsService.uploadLogo(file);
        } catch (error) {
            notificationService.error("Failed to upload logo");
            throw error;
        }
    }
};
