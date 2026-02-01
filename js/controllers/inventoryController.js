import { inventoryService } from "../services/inventoryService.js";
import { productService } from "../services/productService.js";
import { orderService } from "../services/orderService.js";
import { ORDER_STATUS } from "../core/constants.js";
import { notificationService } from "../notificationService.js";

export const inventoryController = {
    /**
     * Loads all data needed for the inventory view for a specific date
     */
    async loadInventoryData(date) {
        try {
            // 1. Fetch enabled categories
            const settings = await inventoryService.getInventorySettings();
            const enabledCatIds = settings.enabledCategories || [];

            // 2. Fetch all products and categories
            const [allProducts, allCategories] = await Promise.all([
                productService.getAllProducts(),
                productService.getAllCategories()
            ]);

            // 3. Filter products based on enabled categories
            const inventoryProducts = allProducts.filter(p => enabledCatIds.includes(p.categoryId));

            // 4. Fetch daily record (baked totals, lock status)
            const dailyRecords = await inventoryService.getDailyInventory(date);

            // 5. Fetch all orders to calculate sales
            // Note: For large datasets, this should be a scoped query by date & status
            const allOrders = await orderService.getAllOrders();
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
            const categoriesWithProducts = allCategories
                .filter(cat => enabledCatIds.includes(cat.id))
                .map(cat => ({
                    ...cat,
                    products: inventoryProducts
                        .filter(p => p.categoryId === cat.id)
                        .map(p => {
                            const record = dailyRecords[p.id] || { totalBaked: 0, locked: false };
                            const sold = salesMap[p.id] || 0;
                            return {
                                ...p,
                                totalBaked: record.totalBaked,
                                locked: record.locked,
                                sold: sold,
                                left: record.totalBaked - sold
                            };
                        })
                }))
                .filter(cat => cat.products.length > 0);

            return categoriesWithProducts;
        } catch (error) {
            console.error("Error loading inventory data:", error);
            notificationService.error("Failed to load inventory data");
            return [];
        }
    },

    async saveProduction(date, productId, totalBaked, locked) {
        return await inventoryService.saveProductionRecord(date, productId, { totalBaked, locked });
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
            notificationService.success("Imported yesterday's totals");
            return true;
        } catch (error) {
            notificationService.error("Import failed");
            return false;
        }
    },

    isSameDate(d1, d2) {
        return d1.getFullYear() === d2.getFullYear() &&
            d1.getMonth() === d2.getMonth() &&
            d1.getDate() === d2.getDate();
    }
};
