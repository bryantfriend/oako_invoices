import { settingsService } from "../services/settingsService.js";
import { notificationService } from "../core/notificationService.js";
import { t } from "../core/i18n.js";

function showSaveResult(result) {
    if (result && result.pending) {
        notificationService.success('Settings saved on this device. They will sync when the connection returns.');
        return;
    }
    notificationService.success(t('msg_save_success'));
}

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
            const result = await settingsService.updateInvoiceSettings(data);
            showSaveResult(result);
            return result || { ok: true, pending: false };
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
    },

    async handleUploadPaymentQr(file) {
        try {
            return await settingsService.uploadPaymentQrImage(file);
        } catch (error) {
            notificationService.error(t('msg_save_fail'));
            throw error;
        }
    }
};
