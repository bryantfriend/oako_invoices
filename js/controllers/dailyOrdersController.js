import { authService } from "../core/authService.js";
import { store } from "../core/store.js";
import { notificationService } from "../core/notificationService.js";
import { orderService } from "../services/orderService.js";
import { productService } from "../services/productService.js";
import { settingsService } from "../services/settingsService.js";
import sessionDataStore from "../services/sessionDataStore.js";
import icfPipeline from "../ICF/engine/pipeline.js";
import saveDailyOrderIntentModule from "../ICF/Intents/SaveDailyOrderIntent.js";

function getActor() {
    var state = store.getState ? store.getState() : {};
    var user = authService.getCurrentUser();
    var profile = state.adminProfile || {};
    return {
        id: user && (user.email || user.uid) ? (user.email || user.uid) : 'anonymous',
        role: profile.role || (user ? 'admin' : 'anonymous')
    };
}

function getPipelineError(result) {
    if (result && Array.isArray(result.errors) && result.errors.length) {
        return result.errors.join(' ');
    }
    return 'The order could not be saved.';
}

export const dailyOrdersController = {
    async loadWorkspace() {
        var results = await Promise.all([
            orderService.getAllOrders().catch(function() { return []; }),
            productService.getAllProducts(),
            productService.getAllCategories(),
            settingsService.getInvoiceSettings()
        ]);
        return {
            orders: results[0] || [],
            products: results[1] || [],
            categories: results[2] || [],
            settings: results[3] || {}
        };
    },

    async saveOrder(draft) {
        var user = authService.getCurrentUser();
        if (!user) {
            throw new Error('Please sign in before saving an order.');
        }

        var payload = Object.assign({}, draft || {}, {
            userId: user.uid,
            orderApi: {
                createOrder: orderService.createOrder.bind(orderService),
                updateOrder: orderService.updateOrder.bind(orderService)
            }
        });
        var intent = saveDailyOrderIntentModule.createSaveDailyOrderIntent(getActor(), payload, {
            source: 'daily-orders-modal'
        });
        var result = await icfPipeline.run(intent);
        if (!result || result.ok !== true) {
            throw new Error(getPipelineError(result));
        }

        var saved = result.data.order;
        sessionDataStore.updateOrderRecord(result.data.orderId, saved, 'daily-orders');
        notificationService.success(result.data.created ? 'Daily order created.' : 'Daily order updated.');
        return saved;
    }
};
