import { inventoryService } from "../services/inventoryService.js";
import { productService } from "../services/productService.js";
import { notificationService } from "../core/notificationService.js";
import { t } from "../core/i18n.js";
import sessionDataStore from "../services/sessionDataStore.js";
import { runSingleFlight } from "../core/singleFlight.js";
import { isNavigationStillCurrent, ignoreStaleRouteResult } from "../core/routeGuard.js";
import { productBelongsToCategory } from "../core/productCategories.js";
import { getDefaultBreadCategoryIds } from "../core/dailyOrders.js";
import { buildInventoryOrderTotals, getInventoryProductQuantities } from "../core/inventoryQuantities.js";

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
            const settings = await inventoryService.getInventorySettings();
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
            const dailyRecords = await inventoryService.getDailyInventory(date);

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
            var orderTotals = buildInventoryOrderTotals(allOrders, date);

            // 7. Group products by category
            const categoriesWithProducts = enabledCategories
                .map(function(category) {
                    var categoryProducts = allProducts.filter(function(product) {
                        return productBelongsToCategory(product, category);
                    }).map(function(product) {
                        const record = dailyRecords[product.id] || { totalBaked: 0, locked: false };
                        // Invoice counters describe the same orders; adding them would reserve stock twice.
                        var quantities = getInventoryProductQuantities(record, orderTotals[product.id]);
                        return Object.assign({}, product, quantities, {
                            locked: record.locked,
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

            return categoriesWithProducts;
        } catch (error) {
            console.error("Error loading inventory data:", error);
            notificationService.error(t('msg_load_fail'));
            return [];
        }
    },

    async saveProduction(date, productId, totalBaked, locked) {
        return await inventoryService.saveProductionRecord(date, productId, { totalBaked, locked });
    },

    async bulkUpdateLockStatus(date, categories, locked) {
        try {
            const promises = [];
            categories.forEach(cat => {
                cat.products.forEach(p => {
                    promises.push(inventoryService.saveProductionRecord(date, p.id, {
                        totalBaked: p.totalBaked,
                        locked: locked
                    }));
                });
            });
            await Promise.all(promises);
            notificationService.success(t('msg_update_success'));
            return true;
        } catch (error) {
            console.error("Bulk update failed:", error);
            notificationService.error(t('msg_update_fail'));
            return false;
        }
    },

    async importYesterday(todayDate) {
        try {
            const yesterday = new Date(todayDate);
            yesterday.setDate(yesterday.getDate() - 1);
            const yDateStr = yesterday.toISOString().split('T')[0];

            const yesterdayRecords = await inventoryService.getDailyInventory(yDateStr);
            const promises = Object.values(yesterdayRecords).map(record =>
                inventoryService.saveProductionRecord(todayDate, record.productId, {
                    totalBaked: record.totalBaked,
                    locked: false // Don't import lock status
                })
            );

            await Promise.all(promises);
            notificationService.success(t('msg_update_success'));
            return true;
        } catch (error) {
            notificationService.error(t('msg_update_fail'));
            return false;
        }
    },

    isSameDate(d1, d2) {
        return d1.getFullYear() === d2.getFullYear() &&
            d1.getMonth() === d2.getMonth() &&
            d1.getDate() === d2.getDate();
    }
};
