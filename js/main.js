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
import { renderCustomerDetail } from "./views/customerDetailView.js";
import { renderInventory } from "./views/inventoryView.js";
import { renderSettings } from "./views/settingsView.js";
import { renderProfile } from "./views/profileView.js";

async function initApp() {
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
        router.addRoute(ROUTES.INVENTORY, renderInventory);
        router.addRoute(ROUTES.CUSTOMERS, renderCustomers);
        router.addRoute(ROUTES.CUSTOMER_DETAIL, renderCustomerDetail);
        router.addRoute(ROUTES.SETTINGS, renderSettings);
        router.addRoute(ROUTES.PROFILE, renderProfile);

        // Init Router (load current URL)
        await router.handleLocationChange();

        // Preload Core Data for Offline Caching (async, non-blocking)
        setTimeout(async () => {
            try {
                const { productService } = await import("./services/productService.js");
                const { customerController } = await import("./controllers/customerController.js");
                const { orderService } = await import("./services/orderService.js");
                const { invoiceService } = await import("./services/invoiceService.js");

                // Fire and forget to populate IndexedDB cache, adding catch to prevent unhandled rejections
                productService.getAllProducts().catch(e => console.warn('Preload ignoring error:', e));
                productService.getAllCategories().catch(e => console.warn('Preload ignoring error:', e));
                customerController.loadAllCustomers().catch(e => console.warn('Preload ignoring error:', e));
                orderService.getAllOrders().catch(e => console.warn('Preload ignoring error:', e));
                invoiceService.getAllInvoices().catch(e => console.warn('Preload ignoring error:', e));
            } catch (e) {
                console.warn("Failed to preload offline data:", e);
            }
        }, 1500); // Small delay to prioritize initial render

        // Remove scaffolding loading screen if it exists
        const loader = document.querySelector('.loading-screen');
        if (loader && loader.parentElement === document.body) {
            loader.remove();
        }

    } catch (error) {
        console.error("App Init Error", error);
        notificationService.error(t('msg_load_fail'));
    }
}

// Global Click Animation Utility
window.playClickAnimation = (e, type) => {
    const el = document.createElement('div');
    el.className = 'click-anim-svg-container';
    let svgContent = '';
    let color = '';

    switch (type) {
        case 'pay':
            color = '#10b981'; // Green
            svgContent = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>`;
            break;
        case 'fulfill':
            color = '#6366f1'; // Indigo
            svgContent = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>`;
            break;
        case 'print':
            color = '#10b981'; // Green
            svgContent = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
            break;
        case 'delete':
            color = '#ef4444'; // Red
            svgContent = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
            break;
        default:
            color = '#f59e0b'; // Amber
            svgContent = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
    }

    el.innerHTML = svgContent;
    el.style.left = `${e.clientX}px`;
    el.style.top = `${e.clientY}px`;
    el.style.color = color;

    document.body.appendChild(el);

    // Remove after animation completes
    setTimeout(() => {
        if (el.parentNode) {
            el.remove();
        }
    }, 1000);
};

// Start
document.addEventListener('DOMContentLoaded', () => {
    initApp();

    // Register Service Worker
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js')
                .then(registration => {
                    console.log('ServiceWorker registration successful with scope: ', registration.scope);
                })
                .catch(err => {
                    console.log('ServiceWorker registration failed: ', err);
                });
        });
    }

    // Offline / Online indicators
    window.addEventListener('online', () => {
        notificationService.success(t('msg_online'));
    });

    window.addEventListener('offline', () => {
        notificationService.error(t('msg_offline'));
    });
});
