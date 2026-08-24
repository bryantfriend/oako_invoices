import { normalizeProductCategory } from "./productCategories.js";

function normalizeIdList(value) {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.map(function(item) {
        return String(item || '').trim();
    }).filter(Boolean);
}

function getLocalDateKey(date) {
    var source = date instanceof Date ? date : new Date(date || Date.now());
    var year = source.getFullYear();
    var month = String(source.getMonth() + 1).padStart(2, '0');
    var day = String(source.getDate()).padStart(2, '0');
    return year + '-' + month + '-' + day;
}

function getOrderDateKey(order) {
    var source = order || {};
    var value = source.orderDate || source.deliveryDate || source.date || '';
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
        return value.slice(0, 10);
    }
    if (value && typeof value.toDate === 'function') {
        return getLocalDateKey(value.toDate());
    }
    if (value && value.seconds) {
        return getLocalDateKey(new Date(Number(value.seconds) * 1000));
    }
    if (value) {
        return getLocalDateKey(value);
    }
    return '';
}

function isBreadCategory(category) {
    var source = category || {};
    var label = [source.name, source.name_en, source.name_ru, source.name_kg, source.slug]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
    return label.indexOf('bread') !== -1
        || label.indexOf('хлеб') !== -1
        || label.indexOf('нан') !== -1;
}

function getDailyOrderFilter(settings, categories) {
    var source = settings || {};
    var categoryIds = normalizeIdList(source.dailyOrderCategoryIds);
    var productIds = normalizeIdList(source.dailyOrderProductIds);
    var isConfigured = source.dailyOrderFilterConfigured === true || categoryIds.length > 0 || productIds.length > 0;

    if (!isConfigured) {
        categoryIds = (Array.isArray(categories) ? categories : []).filter(isBreadCategory).map(function(category) {
            return String(category.id || '').trim();
        }).filter(Boolean);
    }

    return {
        categoryIds: categoryIds,
        productIds: productIds,
        hasExplicitFilter: isConfigured,
        usesBreadDefault: !isConfigured
            && categoryIds.length > 0
    };
}

function buildProductMap(products, categories) {
    var map = {};
    (Array.isArray(products) ? products : []).forEach(function(product) {
        if (!product || !product.id) {
            return;
        }
        map[product.id] = normalizeProductCategory(product, categories);
    });
    return map;
}

function itemMatchesFilter(item, productMap, filter) {
    var source = item || {};
    var productId = String(source.productId || source.id || '').trim();
    var product = productMap[productId] || normalizeProductCategory(source, []);
    var categoryId = String(product.categoryId || source.categoryId || source.category_id || '').trim();

    if (!filter.categoryIds.length && !filter.productIds.length) {
        return true;
    }
    if (productId && filter.productIds.indexOf(productId) !== -1) {
        return true;
    }
    return Boolean(categoryId && filter.categoryIds.indexOf(categoryId) !== -1);
}

function getVisibleOrderItems(order, products, categories, settings) {
    var productMap = buildProductMap(products, categories);
    var filter = getDailyOrderFilter(settings, categories);
    return (Array.isArray(order && order.items) ? order.items : []).filter(function(item) {
        return Number(item && item.quantity) > 0 && itemMatchesFilter(item, productMap, filter);
    });
}

function getOrdersForDate(orders, dateKey, products, categories, settings) {
    return (Array.isArray(orders) ? orders : []).filter(function(order) {
        return Boolean(order && getOrderDateKey(order) === dateKey);
    });
}

function summarizeDailyOrders(orders, products, categories, settings) {
    var productTotals = {};
    var unitCount = 0;
    (Array.isArray(orders) ? orders : []).forEach(function(order) {
        getVisibleOrderItems(order, products, categories, settings).forEach(function(item) {
            var productId = String(item.productId || item.id || item.name || 'product');
            var quantity = Math.max(0, Number(item.quantity) || 0);
            unitCount += quantity;
            productTotals[productId] = (productTotals[productId] || 0) + quantity;
        });
    });
    return {
        orderCount: Array.isArray(orders) ? orders.length : 0,
        productCount: Object.keys(productTotals).length,
        unitCount: unitCount,
        productTotals: productTotals
    };
}

export {
    getDailyOrderFilter,
    getLocalDateKey,
    getOrderDateKey,
    getOrdersForDate,
    getVisibleOrderItems,
    summarizeDailyOrders
};
