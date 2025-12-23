import { authService } from "./core/authService.js";
import { router } from "./router.js";
import { ROUTES } from "./core/constants.js";
import { notificationService } from "./core/notificationService.js";

// View Imports (Dynamic or Static)
import { renderLogin } from "./views/loginView.js";
import { renderDashboard } from "./views/dashboardView.js";
import { renderCreateOrder } from "./views/createOrderView.js";
import { renderOrderDetail } from "./views/orderDetailView.js";
import { renderInvoices, renderInvoiceDetail } from "./views/invoiceView.js";
import { renderCustomers } from "./views/customerView.js";

async function initApp() {
    if (window.location.pathname.endsWith('index.html')) {
        history.replaceState({}, '', '/');
    }

    try {
        // Initialize Auth
        await authService.init();

        // Register Routes
        router.addRoute(ROUTES.LOGIN, renderLogin);
        router.addRoute(ROUTES.DASHBOARD, renderDashboard);
        router.addRoute(ROUTES.CREATE_ORDER, renderCreateOrder);
        router.addRoute(ROUTES.ORDER_DETAIL, renderOrderDetail);
        router.addRoute(ROUTES.INVOICES, renderInvoices);
        router.addRoute(ROUTES.INVOICE_DETAIL, renderInvoiceDetail);
        router.addRoute(ROUTES.CUSTOMERS, renderCustomers);

        // Init Router (load current URL)
        await router.handleLocationChange();

        // Remove scaffolding loading screen if it exists
        const loader = document.querySelector('.loading-screen');
        if (loader && loader.parentElement === document.body) {
            loader.remove();
        }

    } catch (error) {
        console.error("App Init Error", error);
        notificationService.error("Failed to initialize application");
    }
}

// Start
document.addEventListener('DOMContentLoaded', initApp);
