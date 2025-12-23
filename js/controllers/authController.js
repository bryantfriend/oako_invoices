import { authService } from "../core/authService.js";
import { router } from "../router.js";
import { ROUTES } from "../core/constants.js";
import { notificationService } from "../core/notificationService.js";

export const authController = {
    handleLogin: async (email, password) => {
        if (!email || !password) {
            notificationService.error("Please enter email and password");
            return;
        }

        const button = document.querySelector('button[type="submit"]');
        if (button) {
            button.disabled = true;
            button.textContent = "Logging in...";
        }

        const result = await authService.login(email, password);

        if (result.success) {
            notificationService.success("Login successful");
            router.navigate(ROUTES.DASHBOARD);
        } else {
            notificationService.error("Login failed: " + result.error);
            if (button) {
                button.disabled = false;
                button.textContent = "Login";
            }
        }
    }
};
