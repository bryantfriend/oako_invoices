import { orderService } from "../services/orderService.js";
import { customerService } from "../services/customerService.js";
import { productService } from "../services/productService.js";
import { invoiceService } from "../services/invoiceService.js";
import { notificationService } from "../core/notificationService.js";
import { statsService } from "../services/statsService.js";
import { t } from "../core/i18n.js";

function categoryKey(value = '') {
    return String(value || '').trim().toLowerCase();
}

function categoryIdFromName(value = '') {
    const normalized = categoryKey(value)
        .replace(/[^\p{L}\p{N}]+/gu, '-')
        .replace(/^-+|-+$/g, '');
    return normalized || 'uncategorized';
}

function firstValue(...values) {
    return values.find(value => String(value || '').trim());
}

function buildProductCategoryLookup(categories = []) {
    const lookup = {};
    const register = (key, category) => {
        const normalized = categoryKey(key);
        if (normalized) lookup[normalized] = category;
    };

    categories.forEach(category => {
        const name = category.name || category.name_en || category.title || 'Uncategorized';
        const entry = { id: category.id || categoryIdFromName(name), name };
        [
            category.id,
            category.name,
            category.name_en,
            category.name_ru,
            category.name_kg,
            category.slug,
            category.handle,
            category.value
        ].forEach(key => register(key, entry));
    });

    return lookup;
}

function resolveProductCategory(item = {}, product = {}, categoryLookup = {}) {
    const candidates = [
        item.categoryId,
        item.category_id,
        item.categoryID,
        item.categorySlug,
        item.category,
        item.categoryName,
        item.category_name,
        product.categoryId,
        product.category_id,
        product.categoryID,
        product.categorySlug,
        product.category,
        product.categoryName,
        product.category_name
    ];

    for (const candidate of candidates) {
        const matched = categoryLookup[categoryKey(candidate)];
        if (matched) return matched;
    }

    const fallbackName = firstValue(item.categoryName, item.category_name, item.category, product.categoryName, product.category_name, product.category);
    if (fallbackName) {
        return { id: categoryIdFromName(fallbackName), name: fallbackName };
    }

    return { id: 'uncategorized', name: 'Uncategorized' };
}

export const dashboardController = {
    async loadDashboard() {
        try {
            const [orders, customers, products, productCategories, returnInvoices] = await Promise.all([
                orderService.getAllOrders(),
                customerService.getAllCustomers(),
                productService.getAllProducts(),
                productService.getAllCategories(),
                invoiceService.getReturnedInvoicesForAnalytics().catch(function(error) {
                    console.warn("Could not load returned invoice analytics.", error);
                    return [];
                })
            ]);

            // Create a lookup map for customer categories
            const categoryMap = {};
            customers.forEach(c => {
                const name = (c.companyName || c.name || "").toLowerCase().trim();
                if (name) categoryMap[name] = c.category || 'C';
            });

            const productMap = {};
            products.forEach(product => {
                productMap[product.id] = product;
            });

            const productCategoryLookup = buildProductCategoryLookup(productCategories);

            // Map category back to orders and calculate aging
            const now = new Date();
            const ordersWithCategory = orders.map(order => {
                // Priority: orderDate (user-set date) > createdAt (system date)
                let date;
                if (order.orderDate) {
                    date = new Date(order.orderDate);
                } else if (order.createdAt?.toDate) {
                    date = order.createdAt.toDate();
                } else if (order.createdAt) {
                    date = new Date(order.createdAt);
                } else {
                    date = now;
                }

                // Ensure date is valid for aging calculation
                const timestamp = isNaN(date.getTime()) ? now.getTime() : date.getTime();
                const diffDays = Math.floor((now.getTime() - timestamp) / (1000 * 60 * 60 * 24));

                return {
                    ...order,
                    items: (order.items || []).map(item => {
                        const product = productMap[item.productId] || {};
                        const category = resolveProductCategory(item, product, productCategoryLookup);

                        return {
                            ...item,
                            categoryId: category.id,
                            categoryName: category.name
                        };
                    }),
                    customerCategory: categoryMap[(order.customerName || "").toLowerCase().trim()] || 'C',
                    agingDays: Math.max(0, diffDays),
                    isOutstanding: order.status === 'confirmed' || order.status === 'fulfilled' || order.status === 'fullfilled'
                };
            });

            return {
                orders: ordersWithCategory,
                returnOrders: ordersWithCategory,
                returnInvoices: returnInvoices,
                metrics: this.calculateMetrics(ordersWithCategory)
            };
        } catch (error) {
            console.error("Dashboard Load Error:", error);
            notificationService.error(t('msg_load_fail'));
            return { orders: [], returnOrders: [], returnInvoices: [], metrics: {} };
        }
    },

    getRiskAlerts(orders) {
        const criticalOverdue = orders.filter(o =>
            ['confirmed', 'fulfilled', 'fullfilled'].includes(o.status) && (o.agingDays || 0) >= 14
        );

        if (criticalOverdue.length === 0) return null;

        const totalRisk = criticalOverdue.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
        return {
            count: criticalOverdue.length,
            amount: totalRisk,
            label: `${criticalOverdue.length} invoices overdue >14 days · ${totalRisk} сом at risk`
        };
    },

    getPredictiveSignals(orders) {
        return statsService.getPredictiveSignals(orders);
    },

    calculateMetrics(orders) {
        const confirmedStati = ['confirmed', 'fulfilled', 'fullfilled', 'paid'];
        const outstandingStati = ['confirmed', 'fulfilled', 'fullfilled'];

        return {
            totalOrders: orders.length,
            pending: orders.filter(o => o.status === 'pending').length,
            draft: orders.filter(o => o.status === 'draft').length,
            totalConfirmedAmount: orders
                .filter(o => confirmedStati.includes(o.status))
                .reduce((sum, o) => sum + (o.totalAmount || 0), 0),
            outstandingAmount: orders
                .filter(o => outstandingStati.includes(o.status))
                .reduce((sum, o) => sum + (o.totalAmount || 0), 0)
        };
    },

    loadStats(orders, period, revenueGranularity = 'day', returnInvoices = [], returnOrders = orders) {
        return statsService.getDashboardStats(orders, period, revenueGranularity, {
            invoices: returnInvoices,
            orders: returnOrders
        });
    },

    getTopProductsForCategory(orders, categoryId) {
        return statsService.getTopProductsForCategory(orders, categoryId);
    }
};
