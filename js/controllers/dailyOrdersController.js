import { authService } from "../core/authService.js";
import { store } from "../core/store.js";
import { notificationService } from "../core/notificationService.js";
import { productService } from "../services/productService.js";
import { settingsService } from "../services/settingsService.js";
import { customerService } from "../services/customerService.js";
import sessionDataStore from "../services/sessionDataStore.js";
import { connectionStateService } from "../services/connectionStateService.js";
import { readCachedRowsAsync } from "../core/firestoreRead.js";
import icfPipeline from "../ICF/engine/pipeline.js";
import saveDailyOrderIntentModule from "../ICF/Intents/SaveDailyOrderIntent.js";

function buildOrderLoadResult(records, source, error) {
    return {
        records: Array.isArray(records) ? records : [],
        source: source || 'unknown',
        error: error || null
    };
}

function shouldPreferCachedOrderRecords() {
    try {
        var connection = connectionStateService.getSnapshot();
        return connection.browserOnline === false
            || connection.mode === 'offline'
            || connection.mode === 'degraded'
            || (connection.checkedAt && connection.firestoreReachable !== true);
    } catch (error) {
        return false;
    }
}

async function loadDailyOrderRecords() {
    var snapshot = sessionDataStore.getOrdersSnapshot();
    if (snapshot && Array.isArray(snapshot.records) && snapshot.records.length > 0) {
        return buildOrderLoadResult(snapshot.records, snapshot.source || 'session-memory', null);
    }

    if (shouldPreferCachedOrderRecords()) {
        var preferredCachedRecords = await readCachedRowsAsync('orders:all:createdAt_desc').catch(function() {
            return [];
        });
        if (preferredCachedRecords.length > 0) {
            return buildOrderLoadResult(preferredCachedRecords, 'offline-read-cache', null);
        }
    }

    try {
        var loaded = await sessionDataStore.loadOrders({ source: 'daily-orders' });
        var loadedRecords = loaded && Array.isArray(loaded.records) ? loaded.records : [];
        if (loadedRecords.length > 0) {
            return buildOrderLoadResult(loadedRecords, loaded && loaded.meta ? loaded.meta.source : 'session-store', null);
        }

        var cachedAfterEmptyLoad = await readCachedRowsAsync('orders:all:createdAt_desc').catch(function() {
            return [];
        });
        if (cachedAfterEmptyLoad.length > 0) {
            return buildOrderLoadResult(cachedAfterEmptyLoad, 'offline-read-cache', null);
        }

        return buildOrderLoadResult([], loaded && loaded.meta ? loaded.meta.source : 'session-store', null);
    } catch (error) {
        snapshot = sessionDataStore.getOrdersSnapshot();
        if (snapshot && Array.isArray(snapshot.records) && snapshot.records.length > 0) {
            return buildOrderLoadResult(snapshot.records, 'session-after-error', error);
        }

        var cachedRecords = await readCachedRowsAsync('orders:all:createdAt_desc').catch(function() {
            return [];
        });
        if (cachedRecords.length > 0) {
            return buildOrderLoadResult(cachedRecords, 'offline-read-cache', error);
        }

        return buildOrderLoadResult([], 'unavailable', error);
    }
}

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
            loadDailyOrderRecords(),
            productService.getAllProducts(),
            productService.getAllCategories(),
            settingsService.getInvoiceSettings(),
            customerService.getAllCustomers().catch(function() { return []; })
        ]);
        return {
            orders: results[0].records || [],
            orderDataSource: results[0].source || 'unknown',
            orderLoadError: results[0].error || null,
            products: results[1] || [],
            categories: results[2] || [],
            settings: results[3] || {},
            customers: results[4] || []
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
