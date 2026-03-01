import { settingsService } from "../services/settingsService.js";
import { notificationService } from "../core/notificationService.js";
import { t } from "../core/i18n.js";

export const settingsController = {
    async loadSettings() {
        try {
            return await settingsService.getInvoiceSettings();
        } catch (error) {
            notificationService.error(t('msg_load_fail'));
            return null;
        }
    },

    async updateSettings(data) {
        try {
            await settingsService.updateInvoiceSettings(data);
            notificationService.success(t('msg_save_success'));
            return true;
        } catch (error) {
            notificationService.error(t('msg_save_fail'));
            return false;
        }
    },

    async handleUploadLogo(file) {
        try {
            return await settingsService.uploadLogo(file);
        } catch (error) {
            notificationService.error(t('msg_save_fail'));
            throw error;
        }
    }
};
