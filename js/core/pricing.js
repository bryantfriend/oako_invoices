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

export function toFinitePrice(value, label) {
    var price = Number(value);
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
    var source = product || {};
    if (hasOwnValue(source, 'retailPrice')) {
        return toFinitePrice(source.retailPrice, 'Retail Price');
    }
    if (hasOwnValue(source, 'price')) {
        return toFinitePrice(source.price, 'Retail Price');
    }
    if (hasOwnValue(source, 'defaultPrice')) {
        return toFinitePrice(source.defaultPrice, 'Retail Price');
    }
    if (hasOwnValue(source, 'sellPrice')) {
        return toFinitePrice(source.sellPrice, 'Retail Price');
    }
    throw new Error('This product does not have a Retail Price.');
}

export function getProductBusinessPrice(product) {
    var source = product || {};
    if (hasOwnValue(source, 'businessPrice')) {
        return toFinitePrice(source.businessPrice, 'Business Price');
    }
    if (hasOwnValue(source, 'wholesalePrice')) {
        return toFinitePrice(source.wholesalePrice, 'Business Price');
    }
    if (hasOwnValue(source, 'partnerPrice')) {
        return toFinitePrice(source.partnerPrice, 'Business Price');
    }
    if (hasOwnValue(source, 'companyPrice')) {
        return toFinitePrice(source.companyPrice, 'Business Price');
    }
    throw new Error('This product does not have a Business Price.');
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
