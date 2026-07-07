export const ORDER_PRICE_MODES = {
    RETAIL: 'retail',
    BUSINESS: 'business',
    OVERRIDE: 'override'
};

function hasOwnValue(source, key) {
    return source && Object.prototype.hasOwnProperty.call(source, key)
        && source[key] !== null
        && source[key] !== undefined
        && source[key] !== '';
}

function normalizePriceFieldName(key) {
    return String(key || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function buildNormalizedFieldSet(keys) {
    return new Set(keys.map(normalizePriceFieldName));
}

function isFuzzyPriceFieldMatch(normalizedSourceKey, normalizedKeys) {
    for (var key of normalizedKeys) {
        if (key.length > 3 && normalizedSourceKey !== key && (normalizedSourceKey.startsWith(key) || normalizedSourceKey.endsWith(key))) {
            return true;
        }
    }
    return false;
}

const RETAIL_PRICE_FIELDS = [
    'retailPrice',
    'retail price',
    'priceRetail',
    'price_retail',
    'retail_price',
    'retail',
    'price',
    'defaultPrice',
    'default_price',
    'sellPrice',
    'sell_price',
    'salePrice',
    'sale_price',
    'standardPrice',
    'standard_price',
    'unitPrice',
    'unit_price'
];

const BUSINESS_PRICE_FIELDS = [
    'businessPrice',
    'business price',
    'priceBusiness',
    'price_business',
    'businessUnitPrice',
    'business_unit_price',
    'business_price',
    'business',
    'wholesalePrice',
    'wholesale_price',
    'wholesale',
    'partnerPrice',
    'partner_price',
    'partner',
    'companyPrice',
    'company_price',
    'company',
    'b2bPrice',
    'b2BPrice',
    'b2b_price',
    'b2b',
    'tradePrice',
    'trade_price',
    'trade',
    'commercialPrice',
    'commercial_price',
    'commercial',
    'resellerPrice',
    'reseller_price',
    'reseller'
];

const NESTED_PRICE_FIELDS = [
    'prices',
    'pricing',
    'priceList',
    'price_list'
];

function getFirstPriceField(source, keys, label) {
    for (var index = 0; index < keys.length; index += 1) {
        var key = keys[index];
        if (hasOwnValue(source, key)) {
            return {
                found: true,
                price: toFinitePrice(source[key], label)
            };
        }
    }

    var normalizedKeys = buildNormalizedFieldSet(keys);
    var sourceKeys = source && typeof source === 'object' ? Object.keys(source) : [];
    for (var sourceIndex = 0; sourceIndex < sourceKeys.length; sourceIndex += 1) {
        var sourceKey = sourceKeys[sourceIndex];
        if (normalizedKeys.has(normalizePriceFieldName(sourceKey)) && hasOwnValue(source, sourceKey)) {
            return {
                found: true,
                price: toFinitePrice(source[sourceKey], label)
            };
        }
    }

    for (var fuzzyIndex = 0; fuzzyIndex < sourceKeys.length; fuzzyIndex += 1) {
        var fuzzyKey = sourceKeys[fuzzyIndex];
        if (isFuzzyPriceFieldMatch(normalizePriceFieldName(fuzzyKey), normalizedKeys) && hasOwnValue(source, fuzzyKey)) {
            try {
                return {
                    found: true,
                    price: toFinitePrice(source[fuzzyKey], label)
                };
            } catch (_) {
                // Ignore non-price note fields that happen to include a price-like header.
            }
        }
    }

    return {
        found: false,
        price: null
    };
}

function getNestedPriceSource(source) {
    var nestedSources = [];
    for (var index = 0; index < NESTED_PRICE_FIELDS.length; index += 1) {
        var key = NESTED_PRICE_FIELDS[index];
        if (source && source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
            nestedSources.push(source[key]);
        }
    }
    return nestedSources;
}

function resolveProductPrice(product, keys, label) {
    var source = product || {};
    var topLevelResult = getFirstPriceField(source, keys, label);
    if (topLevelResult.found) {
        return topLevelResult.price;
    }

    var nestedSources = getNestedPriceSource(source);
    for (var index = 0; index < nestedSources.length; index += 1) {
        var nestedResult = getFirstPriceField(nestedSources[index], keys, label);
        if (nestedResult.found) {
            return nestedResult.price;
        }
    }

    throw new Error('This product does not have a ' + label + '.');
}

export function toFinitePrice(value, label) {
    var rawValue = value;
    if (typeof rawValue === 'string') {
        var cleaned = rawValue.trim();
        if (cleaned.indexOf(',') !== -1 && cleaned.indexOf('.') === -1) {
            cleaned = /,\d{1,2}$/.test(cleaned) ? cleaned.replace(',', '.') : cleaned.replace(/,/g, '');
        }
        cleaned = cleaned.replace(/\s+/g, '').replace(/[^0-9.-]/g, '');
        rawValue = cleaned === '' ? NaN : cleaned;
    }

    var price = Number(rawValue);
    if (!Number.isFinite(price) || price < 0) {
        throw new Error((label || 'Price') + ' must be a number greater than or equal to 0.');
    }
    return Math.round(price * 100) / 100;
}

export function normalizePriceMode(priceMode, fallbackMode) {
    var mode = String(priceMode || '').toLowerCase();
    if (mode === ORDER_PRICE_MODES.RETAIL || mode === ORDER_PRICE_MODES.BUSINESS) {
        return mode;
    }
    if (mode === ORDER_PRICE_MODES.OVERRIDE) {
        return ORDER_PRICE_MODES.OVERRIDE;
    }
    return fallbackMode || ORDER_PRICE_MODES.RETAIL;
}

export function normalizeDefaultOrderPriceMode(priceMode) {
    var mode = normalizePriceMode(priceMode, ORDER_PRICE_MODES.RETAIL);
    if (mode === ORDER_PRICE_MODES.BUSINESS) {
        return ORDER_PRICE_MODES.BUSINESS;
    }
    return ORDER_PRICE_MODES.RETAIL;
}

export function getProductRetailPrice(product) {
    return resolveProductPrice(product, RETAIL_PRICE_FIELDS, 'Retail Price');
}

export function getProductBusinessPrice(product) {
    return resolveProductPrice(product, BUSINESS_PRICE_FIELDS, 'Business Price');
}

export function getProductPriceByMode(product, priceMode) {
    var mode = normalizePriceMode(priceMode, ORDER_PRICE_MODES.RETAIL);
    if (mode === ORDER_PRICE_MODES.BUSINESS) {
        return getProductBusinessPrice(product);
    }
    if (mode === ORDER_PRICE_MODES.RETAIL) {
        return getProductRetailPrice(product);
    }
    throw new Error('Manual override requires an override price.');
}

export function tryGetProductPriceByMode(product, priceMode) {
    try {
        return {
            ok: true,
            price: getProductPriceByMode(product, priceMode),
            error: ''
        };
    } catch (error) {
        return {
            ok: false,
            price: null,
            error: error && error.message ? error.message : 'Price is not available.'
        };
    }
}

export function snapshotProductPrices(product) {
    var retailResult = tryGetProductPriceByMode(product, ORDER_PRICE_MODES.RETAIL);
    var businessResult = tryGetProductPriceByMode(product, ORDER_PRICE_MODES.BUSINESS);
    return {
        originalRetailPrice: retailResult.ok ? retailResult.price : null,
        originalBusinessPrice: businessResult.ok ? businessResult.price : null
    };
}

export function getOrderItemUnitPrice(item) {
    var source = item || {};
    if (source.unitPrice !== undefined && source.unitPrice !== null && source.unitPrice !== '') {
        return toFinitePrice(source.unitPrice, 'Unit Price');
    }
    if (source.price !== undefined && source.price !== null && source.price !== '') {
        return toFinitePrice(source.price, 'Unit Price');
    }
    return 0;
}

export function calculateOrderItemSubtotal(item) {
    var source = item || {};
    var quantity = Number(source.adjustedQuantity !== undefined ? source.adjustedQuantity : source.quantity);
    if (!Number.isFinite(quantity) || quantity < 0) {
        quantity = 0;
    }
    return Math.round(getOrderItemUnitPrice(source) * quantity * 100) / 100;
}

export function calculateOrderTotals(orderItems) {
    var items = Array.isArray(orderItems) ? orderItems : [];
    var subtotal = items.reduce(function(sum, item) {
        return sum + calculateOrderItemSubtotal(item);
    }, 0);
    return {
        subtotal: Math.round(subtotal * 100) / 100,
        totalAmount: Math.round(subtotal * 100) / 100
    };
}

export function calculateInvoiceTotals(invoiceItems) {
    return calculateOrderTotals(invoiceItems);
}

export function resolveOrderItemUnitPrice(product, priceMode, overridePrice) {
    var mode = normalizePriceMode(priceMode, ORDER_PRICE_MODES.RETAIL);
    if (mode === ORDER_PRICE_MODES.OVERRIDE) {
        return toFinitePrice(overridePrice, 'Override Price');
    }
    return getProductPriceByMode(product, mode);
}

export function normalizeOrderItemPricing(item) {
    var source = item || {};
    var selectedBasePriceMode = normalizeDefaultOrderPriceMode(source.selectedBasePriceMode || source.basePriceMode || source.priceMode);
    var priceOverridden = source.priceOverridden === true || normalizePriceMode(source.priceMode, selectedBasePriceMode) === ORDER_PRICE_MODES.OVERRIDE;
    var unitPrice = priceOverridden && source.overridePrice !== undefined && source.overridePrice !== null && source.overridePrice !== ''
        ? toFinitePrice(source.overridePrice, 'Override Price')
        : getOrderItemUnitPrice(source);
    var priceMode = priceOverridden ? ORDER_PRICE_MODES.OVERRIDE : normalizeDefaultOrderPriceMode(source.priceMode || selectedBasePriceMode);
    var quantity = Number(source.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
        quantity = 1;
    }
    var normalized = Object.assign({}, source, {
        priceMode: priceMode,
        selectedBasePriceMode: selectedBasePriceMode,
        unitPrice: unitPrice,
        price: unitPrice,
        quantity: quantity,
        originalRetailPrice: source.originalRetailPrice !== undefined ? source.originalRetailPrice : null,
        originalBusinessPrice: source.originalBusinessPrice !== undefined ? source.originalBusinessPrice : null,
        priceOverridden: priceOverridden,
        overridePrice: priceOverridden ? unitPrice : null,
        overrideReason: source.overrideReason || '',
        overrideBy: source.overrideBy || null,
        overrideAt: source.overrideAt || null
    });
    normalized.lineSubtotal = calculateOrderItemSubtotal(normalized);
    normalized.total = normalized.lineSubtotal;
    return normalized;
}

export function buildPricedOrderItemFromProduct(product, priceMode, quantity) {
    var source = product || {};
    var selectedBasePriceMode = normalizeDefaultOrderPriceMode(priceMode);
    var snapshots = snapshotProductPrices(source);
    var unitPrice = getProductPriceByMode(source, selectedBasePriceMode);
    var displayName = source.displayName || source.name || source.name_en || source.title || 'Product';
    return normalizeOrderItemPricing({
        productId: source.id || source.productId || '',
        name: displayName,
        name_en: source.name_en || source.nameEn || displayName,
        name_ru: source.name_ru || source.nameRu || '',
        name_kg: source.name_kg || source.nameKg || '',
        categoryId: source.categoryId || source.category_id || source.category || '',
        categoryName: source.categoryName || source.category_name || source.category || '',
        quantity: quantity || 1,
        imageUrl: source.imageUrl || '',
        weight: source.weight || source.weightText || '',
        priceMode: selectedBasePriceMode,
        selectedBasePriceMode: selectedBasePriceMode,
        unitPrice: unitPrice,
        price: unitPrice,
        originalRetailPrice: snapshots.originalRetailPrice,
        originalBusinessPrice: snapshots.originalBusinessPrice,
        priceOverridden: false,
        overridePrice: null,
        overrideReason: '',
        overrideBy: null,
        overrideAt: null
    });
}

export function repriceOrderItem(item, priceMode) {
    var normalized = normalizeOrderItemPricing(item);
    var selectedBasePriceMode = normalizeDefaultOrderPriceMode(priceMode);
    if (normalized.priceOverridden) {
        return Object.assign({}, normalized, {
            selectedBasePriceMode: selectedBasePriceMode
        });
    }

    var unitPrice = null;
    if (selectedBasePriceMode === ORDER_PRICE_MODES.BUSINESS) {
        if (normalized.originalBusinessPrice === null || normalized.originalBusinessPrice === undefined || normalized.originalBusinessPrice === '') {
            throw new Error('This product does not have a Business Price.');
        }
        unitPrice = toFinitePrice(normalized.originalBusinessPrice, 'Business Price');
    } else {
        if (normalized.originalRetailPrice === null || normalized.originalRetailPrice === undefined || normalized.originalRetailPrice === '') {
            throw new Error('This product does not have a Retail Price.');
        }
        unitPrice = toFinitePrice(normalized.originalRetailPrice, 'Retail Price');
    }

    return normalizeOrderItemPricing(Object.assign({}, normalized, {
        selectedBasePriceMode: selectedBasePriceMode,
        priceMode: selectedBasePriceMode,
        unitPrice: unitPrice,
        price: unitPrice,
        priceOverridden: false,
        overridePrice: null
    }));
}

export function applyPriceOverrideToItem(item, overridePrice, reason, actorId, overrideAt) {
    var normalized = normalizeOrderItemPricing(item);
    var unitPrice = toFinitePrice(overridePrice, 'Override Price');
    return normalizeOrderItemPricing(Object.assign({}, normalized, {
        priceMode: ORDER_PRICE_MODES.OVERRIDE,
        unitPrice: unitPrice,
        price: unitPrice,
        priceOverridden: true,
        overridePrice: unitPrice,
        overrideReason: reason || '',
        overrideBy: actorId || null,
        overrideAt: overrideAt || new Date().toISOString()
    }));
}

export function clearPriceOverrideFromItem(item) {
    var normalized = normalizeOrderItemPricing(item);
    return repriceOrderItem(Object.assign({}, normalized, {
        priceOverridden: false,
        overridePrice: null,
        overrideReason: '',
        overrideBy: null,
        overrideAt: null,
        priceMode: normalized.selectedBasePriceMode
    }), normalized.selectedBasePriceMode);
}
