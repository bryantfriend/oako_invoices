import { authService } from "../core/authService.js";
import { router } from "../router.js";
import { ROUTES } from "../core/constants.js";
import { notificationService } from "../core/notificationService.js";
import { t } from "../core/i18n.js";

export const authController = {
    handleLogin: async (email, password) => {
        if (!email || !password) {
            notificationService.error(t('login_err_missing'));
            return;
        }

        const button = document.querySelector('button[type="submit"]');
        if (button) {
            button.disabled = true;
            button.textContent = t('login_loading');
        }

        const result = await authService.login(email, password);

        if (result.success) {
            notificationService.success(t('login_success'));
            router.navigate(ROUTES.DASHBOARD);
        } else {
            notificationService.error(t('login_fail') + ": " + result.error);
            if (button) {
                button.disabled = false;
                button.textContent = t('login_btn');
            }
        }
    },

    handlePasswordReset: async (email) => {
        if (!email) {
            notificationService.error(t('password_reset_err_missing_email'));
            return;
        }

        const button = document.getElementById('password-reset-btn');
        if (button) {
            button.disabled = true;
            button.textContent = t('password_reset_loading');
        }

        const result = await authService.sendPasswordReset(email);

        if (result.success) {
            notificationService.success(t('password_reset_success'));
        } else {
            notificationService.error(t('password_reset_fail') + ": " + result.error);
        }

        if (button) {
            button.disabled = false;
            button.textContent = t('password_reset_link');
        }
    }
};
