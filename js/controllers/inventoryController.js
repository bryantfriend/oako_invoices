import { inventoryService } from "../services/inventoryService.js";
import { productService } from "../services/productService.js";
import sessionDataStore from "../services/sessionDataStore.js";
import { runSingleFlight } from "../core/singleFlight.js";
import { isNavigationStillCurrent, ignoreStaleRouteResult } from "../core/routeGuard.js";
import { productBelongsToCategory } from "../core/productCategories.js";
import { getDefaultBreadCategoryIds } from "../core/dailyOrders.js";
import { buildInventoryOrderTotals, getInventoryProductQuantities } from "../core/inventoryQuantities.js";
import { productReconciliationService } from "../services/productReconciliationService.js";

export const inventoryController = {
    /**
     * Loads all data needed for the inventory view for a specific date
     */
    async loadInventoryData(date, options) {
        var safeOptions = options || {};
        var key = 'inventory:daily:' + String(date || 'today') + (safeOptions.forceRefresh === true ? ':refresh' : '');
        return runSingleFlight(key, function() {
            return inventoryController.loadInventoryDataOnce(date, safeOptions);
        });
    },

    async loadInventoryDataOnce(date, options) {
        var safeOptions = options || {};
        try {
            // 1. Fetch enabled categories
            const settings = await inventoryService.getInventorySettings({ requireAvailable: true });
            var enabledCatIds = Array.isArray(settings.enabledCategories) ? settings.enabledCategories.slice() : [];
            var usesBreadDefault = false;

            // 2. Fetch all products and categories
            const [allProducts, allCategories] = await Promise.all([
                productService.getAllProducts(),
                productService.getAllCategories()
            ]);

            if (!enabledCatIds.length) {
                enabledCatIds = getDefaultBreadCategoryIds(allCategories);
                usesBreadDefault = enabledCatIds.length > 0;
            }

            // 3. Resolve enabled categories while preserving legacy category field compatibility.
            var enabledCategories = allCategories.filter(function(category) {
                return enabledCatIds.indexOf(category.id) !== -1;
            });
            if (!enabledCategories.length && enabledCatIds.length) {
                enabledCategories = enabledCatIds.map(function(categoryId) {
                    return { id: categoryId, name: categoryId };
                });
            }

            // 4. Fetch daily record (baked totals, lock status)
            const dailyRecords = await inventoryService.getDailyInventory(date, safeOptions);

            // 5. Count saved orders for their scheduled date, including drafts.
            var orderSnapshot = sessionDataStore.getOrdersSnapshot();
            var shouldRefreshOrders = safeOptions.forceRefresh === true || Boolean(orderSnapshot && orderSnapshot.shouldRefresh);
            var allOrders = orderSnapshot && Array.isArray(orderSnapshot.records) ? orderSnapshot.records : null;
            if (!allOrders || shouldRefreshOrders) {
                var loadedOrders = await sessionDataStore.loadOrders({
                    source: 'inventory',
                    forceRefresh: shouldRefreshOrders
                });
                allOrders = loadedOrders.records || [];
            }
            if (safeOptions.routeName && safeOptions.navigationId && !isNavigationStillCurrent(safeOptions.navigationId, safeOptions.routeName)) {
                ignoreStaleRouteResult('inventory-load', safeOptions.routeName, safeOptions.navigationId);
                return [];
            }
            await productReconciliationService.loadContext(allProducts, allCategories);
            var reconciledOrders = productReconciliationService.projectRecords(allOrders, 'inventory');
            var orderTotals = buildInventoryOrderTotals(reconciledOrders, date);

            // 7. Group products by category
            const categoriesWithProducts = enabledCategories
                .map(function(category) {
                    var categoryProducts = allProducts.filter(function(product) {
                        return productBelongsToCategory(product, category);
                    }).map(function(product) {
                        const record = dailyRecords[product.id] || { locked: false };
                        // Invoice counters describe the same orders; adding them would reserve stock twice.
                        var quantities = getInventoryProductQuantities(record, orderTotals[product.id]);
                        return Object.assign({}, product, quantities, {
                            locked: record.locked,
                            hasProductionRecord: record.totalBaked !== undefined,
                            sold: quantities.ordered,
                            inventoryDate: date,
                            reservesSavedOrders: true
                        });
                    });
                    return Object.assign({}, category, {
                        products: categoryProducts,
                        inventoryUsesBreadDefault: usesBreadDefault
                    });
                })
                .filter(function(category) {
                    return category.products.length > 0;
                });

            categoriesWithProducts.readSource = settings.__stale ? 'cache' : dailyRecords.__readSource || 'server';
            categoriesWithProducts.confirmedEmpty = categoriesWithProducts.readSource === 'server' && Object.keys(dailyRecords).length === 0;
            return categoriesWithProducts;
        } catch (error) {
            console.error("Error loading inventory data:", error);
            throw error;
        }
    },

    async saveProduction(date, productId, totalBaked) {
        return inventoryService.saveProductionRecord(date, productId, { totalBaked: totalBaked });
    },

    async bulkUpdateLockStatus(date, categories, locked) {
        var entries = [];
        var seen = new Set();
        categories.forEach(function collectCategory(category) {
            category.products.forEach(function collectProduct(product) {
                if (seen.has(product.id)) return;
                seen.add(product.id);
                entries.push({ productId: product.id, data: { locked: locked } });
            });
        });
        return inventoryService.setLockStatus(date, entries);
    },

    async setLockStatus(date, productId, locked) {
        return inventoryService.setLockStatus(date, [{ productId: productId, data: { locked: locked } }]);
    },

    async initializeDay(date, entries) {
        return inventoryService.initializeDay(date, entries);
    },

    async importYesterday(todayDate, retryEntries, allowedProductIds) {
        var entries = retryEntries;
        if (!entries) {
            var yesterday = new Date(todayDate + 'T12:00:00Z');
            yesterday.setUTCDate(yesterday.getUTCDate() - 1);
            var records = await inventoryService.getDailyInventory(yesterday.toISOString().slice(0, 10), { forceRefresh: true });
            if (records.__readSource !== 'server') throw new Error('Reconnect to verify yesterday’s inventory before importing.');
            entries = Object.values(records).filter(function eligibleRecord(record) {
                return !allowedProductIds || allowedProductIds.indexOf(record.productId) !== -1;
            }).map(function importRecord(record) {
                return { productId: record.productId, data: { totalBaked: record.totalBaked, locked: false } };
            });
        }
        if (!entries.length) throw new Error('No production records to import from yesterday.');
        var result = await inventoryService.importDay(todayDate, entries);
        result.retryEntries = entries.filter(function failedEntry(entry) {
            return result.failed.some(function matchesFailure(failure) { return failure.productId === entry.productId; });
        });
        return result;
    },

    isSameDate(d1, d2) {
        return d1.getFullYear() === d2.getFullYear() &&
            d1.getMonth() === d2.getMonth() &&
            d1.getDate() === d2.getDate();
    }
};
