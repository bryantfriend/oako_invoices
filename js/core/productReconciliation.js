import { findProductCategory, productBelongsToCategory } from "./productCategories.js";

function normalizeProductName(value) {
    return String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

function getCurrentProductName(product) {
    var source = product || {};
    return String(source.name || source.name_en || source.title || source.title_en || source.name_ru || source.name_kg || source.displayName || 'Unnamed product').trim();
}

function getSourceIdentity(item, products, categories) {
    if (item._catalogSource) {
        return Object.assign({}, item._catalogSource);
    }
    var productId = String(item.productId || item.id || '');
    var current = products.find(function(product) { return product.id === productId; });
    var category = findProductCategory(item, categories) || findProductCategory(current, categories);
    return {
        productId: productId,
        name: String(item.name || item.productName || item.displayName || item.name_en || item.name_ru || item.name_kg || ''),
        categoryId: category ? category.id : '',
        categoryName: category ? category.name : String(item.categoryName || item.category_name || (typeof item.category === 'string' ? item.category : '') || '')
    };
}

function getProductMatchKey(source) {
    // Keep names with different historical IDs/categories separate. No fuzzy matching.
    return encodeURIComponent(JSON.stringify([source.productId || '', source.categoryId || source.categoryName || '', normalizeProductName(source.name)]));
}

function getCategoryProducts(products, categories, categoryId) {
    var category = categories.find(function(entry) { return entry.id === categoryId; });
    return category ? products.filter(function(product) { return productBelongsToCategory(product, category); }) : [];
}

function isCurrentName(name, product) {
    var names = [getCurrentProductName(product), product.name, product.name_en, product.name_ru, product.name_kg, product.title, product.title_en];
    return names.some(function(value) { return value && normalizeProductName(value) === normalizeProductName(name); });
}

function reconcileProductRecords(records, context) {
    var products = (context.products || []).filter(function(product) { return product.active !== false && product.archived !== true; });
    var categories = context.categories || [];
    var mappings = context.mappings || {};
    var issues = Object.create(null);

    function reconcileItem(item) {
        if (!item) { return item; }
        var source = getSourceIdentity(item, products, categories);
        var key = getProductMatchKey(source);
        var mapping = mappings[key];
        var matched = mapping && products.find(function(product) { return product.id === mapping.productId; });
        if (matched && !getCategoryProducts(products, categories, mapping.categoryId).some(function(product) { return product.id === matched.id; })) {
            matched = null;
        }
        if (!matched) {
            var byId = products.find(function(product) { return product.id === source.productId; });
            if (byId && (!source.name || isCurrentName(source.name, byId))) {
                matched = byId;
            } else if (!byId && source.name) {
                var candidates = source.categoryId ? getCategoryProducts(products, categories, source.categoryId) : products;
                var exactNames = candidates.filter(function(product) { return isCurrentName(source.name, product); });
                if (exactNames.length === 1) { matched = exactNames[0]; }
            }
        }
        if (matched) {
            var category = findProductCategory(matched, categories);
            var name = getCurrentProductName(matched);
            return Object.assign({}, item, {
                _catalogSource: source, productMatchPending: false,
                productId: matched.id, name: name, productName: name, displayName: name,
                categoryId: category ? category.id : '', categoryName: category ? category.name : ''
            });
        }
        if (!issues[key]) {
            issues[key] = { key: key, source: source, occurrences: 0, quantity: 0 };
        }
        issues[key].occurrences += 1;
        issues[key].quantity += Number(item.adjustedQuantity !== undefined ? item.adjustedQuantity : item.quantity) || 0;
        return Object.assign({}, item, {
            _catalogSource: source, productMatchPending: true,
            productId: '', name: 'Product match needed', productName: 'Product match needed', displayName: 'Product match needed'
        });
    }

    var projected = (Array.isArray(records) ? records : []).map(function(record) {
        if (!record) { return record; }
        var result = Object.assign({}, record);
        function reconcileReturnItem(item) {
            var parent = (record.items || []).find(function(line) {
                return line && item && ((item.lineItemId && item.lineItemId === line.lineItemId) || (item.productId && item.productId === line.productId));
            }) || {};
            return reconcileItem(Object.assign({
                productId: parent.productId || '', name: parent.name || parent.productName || '',
                categoryId: parent.categoryId || '', categoryName: parent.categoryName || '',
                _catalogSource: parent._catalogSource
            }, item));
        }
        ['items', 'returnItems'].forEach(function(field) {
            if (Array.isArray(record[field])) { result[field] = record[field].map(field === 'items' ? reconcileItem : reconcileReturnItem); }
        });
        ['returns', 'courierReturns', 'deliveryReturns'].forEach(function(field) {
            if (!Array.isArray(record[field])) { return; }
            result[field] = record[field].map(function(event) {
                var projectedEvent = Object.assign({}, event);
                ['items', 'returnItems', 'returns'].forEach(function(itemField) {
                    if (Array.isArray(event[itemField])) { projectedEvent[itemField] = event[itemField].map(reconcileReturnItem); }
                });
                return projectedEvent;
            });
        });
        return result;
    });
    return { records: projected, issues: Object.keys(issues).map(function(key) { return issues[key]; }) };
}

export { normalizeProductName, getCurrentProductName, getSourceIdentity, getProductMatchKey, getCategoryProducts, reconcileProductRecords };
