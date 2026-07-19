import { inventoryService } from "../services/inventoryService.js";
import { productService } from "../services/productService.js";
import { orderService } from "../services/orderService.js";
import { ORDER_STATUS } from "../core/constants.js";
import { notificationService } from "../core/notificationService.js";
import { t } from "../core/i18n.js";
import sessionDataStore from "../services/sessionDataStore.js";
import { runSingleFlight } from "../core/singleFlight.js";
import { isNavigationStillCurrent, ignoreStaleRouteResult } from "../core/routeGuard.js";
import { productBelongsToCategory } from "../core/productCategories.js";

export const inventoryController = {
    /**
     * Loads all data needed for the inventory view for a specific date
     */
    async loadInventoryData(date, options) {
        var safeOptions = options || {};
        var key = 'inventory:daily:' + String(date || 'today');
        return runSingleFlight(key, function() {
            return inventoryController.loadInventoryDataOnce(date, safeOptions);
        });
    },

    async loadInventoryDataOnce(date, options) {
        var safeOptions = options || {};
        try {
            // 1. Fetch enabled categories
            const settings = await inventoryService.getInventorySettings();
            const enabledCatIds = settings.enabledCategories || [];

            // 2. Fetch all products and categories
            const [allProducts, allCategories] = await Promise.all([
                productService.getAllProducts(),
                productService.getAllCategories()
            ]);

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

            // 5. Fetch all orders to calculate sales
            // Note: For large datasets, this should be a scoped query by date & status
            const orderSnapshot = sessionDataStore.getOrdersSnapshot();
            let allOrders = orderSnapshot && Array.isArray(orderSnapshot.records) ? orderSnapshot.records : null;
            if (!allOrders && safeOptions.routeName && safeOptions.routeName !== 'inventory') {
                console.info('[SINGLE_FLIGHT] ignored stale key=inventory:daily:' + date);
                allOrders = [];
            }
            if (!allOrders) {
                allOrders = await orderService.getAllOrders();
            }
            if (safeOptions.routeName && safeOptions.navigationId && !isNavigationStillCurrent(safeOptions.navigationId, safeOptions.routeName)) {
                ignoreStaleRouteResult('inventory-load', safeOptions.routeName, safeOptions.navigationId);
                return [];
            }
            const fulfilledOrders = allOrders.filter(o =>
                (o.status === ORDER_STATUS.FULFILLED || o.status === ORDER_STATUS.PAID) &&
                o.fulfilledAt &&
                this.isSameDate(o.fulfilledAt?.toDate?.() || new Date(o.fulfilledAt), new Date(date))
            );

            // 6. Calculate sales per product
            const salesMap = {};
            fulfilledOrders.forEach(order => {
                order.items.forEach(item => {
                    salesMap[item.productId] = (salesMap[item.productId] || 0) + (item.quantity || 0);
                });
            });

            // 7. Group products by category
            const categoriesWithProducts = enabledCategories
                .map(function(category) {
                    var categoryProducts = allProducts.filter(function(product) {
                        return productBelongsToCategory(product, category);
                    }).map(function(product) {
                        const record = dailyRecords[product.id] || { totalBaked: 0, locked: false };
                        const automaticSold = record.invoiceQuantity !== undefined ? Number(record.invoiceQuantity) || 0 : null;
                        const returned = Number(record.returnedQuantity || 0);
                        const sold = automaticSold !== null ? automaticSold : (salesMap[product.id] || 0);
                        const left = record.availableQuantity !== undefined
                            ? Number(record.availableQuantity) || 0
                            : record.totalBaked - sold + returned;
                        return Object.assign({}, product, {
                            totalBaked: record.totalBaked,
                            locked: record.locked,
                            sold: sold,
                            returned: returned,
                            left: left
                        });
                    });
                    return Object.assign({}, category, { products: categoryProducts });
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
