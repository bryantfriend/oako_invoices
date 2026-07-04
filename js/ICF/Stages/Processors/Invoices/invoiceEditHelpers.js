import { getOrderItemUnitPrice, normalizeOrderItemPricing } from "../../../../core/pricing.js";
function safeNumber(value, fallback) {
  var number = Number(value);
  if (Number.isFinite(number)) {
    return number;
  }
  return fallback || 0;
}

function getInvoiceItemName(item) {
  return item.displayName || item.name || item.name_en || item.name_ru || item.name_kg || item.productName || "Product";
}

function makeLineItemId(productId, index) {
  var safeProductId = String(productId || "item").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24) || "item";

  if (Number.isInteger(index)) {
    return [
      "line",
      safeProductId,
      String(index)
    ].join("-");
  }

  return [
    "line",
    safeProductId,
    Date.now().toString(36),
    Math.random().toString(36).slice(2, 8)
  ].join("-");
}

function getItemReturnedQuantity(item) {
  return Math.max(0, safeNumber(item && item.returnedQuantity, 0));
}

function getItemRemainingQuantity(item) {
  var quantity = safeNumber(item && item.quantity, 0);
  var returnedQuantity = getItemReturnedQuantity(item);
  return Math.max(0, quantity - returnedQuantity);
}

function getItemOriginalTotal(item) {
  var source = item || {};
  if (source.total !== undefined) {
    return safeNumber(source.total, 0);
  }
  return getOrderItemUnitPrice(source) * safeNumber(source.quantity, 0);
}

function getItemAdjustedTotal(item) {
  var source = item || {};
  if (source.adjustedTotal !== undefined) {
    return safeNumber(source.adjustedTotal, 0);
  }
  return getOrderItemUnitPrice(source) * getItemRemainingQuantity(source);
}

function normalizeInvoiceItemReturnFields(item) {
  var source = item || {};
  var returnedQuantity = getItemReturnedQuantity(source);
  var remainingQuantity = getItemRemainingQuantity(source);
  var originalTotal = getItemOriginalTotal(source);
  var adjustedTotal = getOrderItemUnitPrice(source) * remainingQuantity;

  return Object.assign({}, source, {
    returnedQuantity: returnedQuantity,
    remainingQuantity: remainingQuantity,
    returnedAmount: safeNumber(source.returnedAmount, 0),
    adjustedTotal: adjustedTotal,
    total: originalTotal
  });
}

function normalizeInvoiceItem(item, index) {
  var source = item || {};
  var quantity = safeNumber(source.adjustedQuantity !== undefined ? source.adjustedQuantity : source.quantity, 0);
  var price = getOrderItemUnitPrice(source);
  var returnedQuantity = safeNumber(source.returnedQuantity, 0);
  var normalized = Object.assign({}, source, {
    lineItemId: source.lineItemId || makeLineItemId(source.productId || source.id || "item", index),
    productId: source.productId || source.id || "",
    displayName: source.displayName || getInvoiceItemName(source),
    quantity: quantity,
    adjustedQuantity: quantity,
    price: price,
    unitPrice: price,
    total: source.total !== undefined ? safeNumber(source.total, 0) : price * quantity,
    lineSubtotal: source.lineSubtotal !== undefined ? safeNumber(source.lineSubtotal, 0) : price * quantity,
    priceMode: source.priceMode || 'retail',
    selectedBasePriceMode: source.selectedBasePriceMode || source.priceMode || 'retail',
    originalRetailPrice: source.originalRetailPrice !== undefined ? source.originalRetailPrice : price,
    originalBusinessPrice: source.originalBusinessPrice !== undefined ? source.originalBusinessPrice : null,
    priceOverridden: source.priceOverridden === true,
    overridePrice: source.overridePrice !== undefined ? source.overridePrice : null,
    overrideReason: source.overrideReason || '',
    overrideBy: source.overrideBy || null,
    overrideAt: source.overrideAt || null,
    returnedQuantity: returnedQuantity,
    returnedAmount: safeNumber(source.returnedAmount, 0)
  });

  return normalizeInvoiceItemReturnFields(normalized);
}

function normalizeInvoiceItemsForEditing(invoice) {
  var sourceItems = invoice && Array.isArray(invoice.items) ? invoice.items : [];
  return sourceItems.map(normalizeInvoiceItem);
}

function buildInvoiceItemFromProduct(product, quantity) {
  var source = product || {};
  var itemQuantity = safeNumber(quantity, 1);
  var price = getOrderItemUnitPrice(source);
  var displayName = source.displayName || source.name || source.name_en || source.name_ru || source.name_kg || source.title || "Product";

  return {
    lineItemId: makeLineItemId(source.id || source.productId),
    productId: source.id || source.productId || "",
    name: source.name || displayName,
    name_en: source.name_en || source.nameEn || source.title_en || displayName,
    name_ru: source.name_ru || source.nameRu || source.title_ru || source.name || displayName,
    name_kg: source.name_kg || source.nameKg || source.title_kg || source.name || displayName,
    displayName: displayName,
    price: price,
    unitPrice: price,
    priceMode: source.priceMode || 'retail',
    selectedBasePriceMode: source.selectedBasePriceMode || source.priceMode || 'retail',
    originalRetailPrice: source.originalRetailPrice !== undefined ? source.originalRetailPrice : price,
    originalBusinessPrice: source.originalBusinessPrice !== undefined ? source.originalBusinessPrice : null,
    priceOverridden: source.priceOverridden === true,
    overridePrice: source.overridePrice !== undefined ? source.overridePrice : null,
    overrideReason: source.overrideReason || '',
    overrideBy: source.overrideBy || null,
    overrideAt: source.overrideAt || null,
    weight: source.weight || source.weightText || "",
    quantity: itemQuantity,
    adjustedQuantity: itemQuantity,
    total: price * itemQuantity,
    returnedQuantity: 0,
    returnedAmount: 0
  };
}

function recalculateInvoiceTotals(invoice) {
  var source = invoice || {};
  var items = normalizeInvoiceItemsForEditing(source);
  var subtotal = items.reduce(function(sum, item) {
    return sum + safeNumber(item.total, 0);
  }, 0);
  var taxRate = safeNumber(source.taxRate, 0);
  var taxAmount = subtotal * taxRate / 100;
  var discountAmount = safeNumber(source.discountAmount, 0);

  if (source.discountType === "percent" && source.discountValue) {
    discountAmount = subtotal * safeNumber(source.discountValue, 0) / 100;
  } else if (source.discountType === "fixed") {
    discountAmount = safeNumber(source.discountValue, 0);
  }

  var totalWeight = items.reduce(function(sum, item) {
    var weight = safeNumber(item.weight, 0);
    return sum + (weight * safeNumber(item.quantity, 0));
  }, 0);

  var totals = {
    items: items,
    subtotal: subtotal,
    taxAmount: taxAmount,
    discountAmount: discountAmount,
    totalAmount: subtotal + taxAmount - discountAmount
  };

  if (totalWeight > 0 || source.totalWeight !== undefined) {
    totals.totalWeight = totalWeight;
  }

  if (source.returnSummary || (Array.isArray(source.returns) && source.returns.length > 0) || items.some(function(item) {
    return getItemReturnedQuantity(item) > 0;
  })) {
    var totalReturnedQuantity = items.reduce(function(sum, item) {
      return sum + getItemReturnedQuantity(item);
    }, 0);
    var totalReturnedAmount = items.reduce(function(sum, item) {
      if (item.returnedAmount !== undefined) {
        return sum + safeNumber(item.returnedAmount, 0);
      }
      return sum + (getOrderItemUnitPrice(item) * getItemReturnedQuantity(item));
    }, 0);
    totals.returnSummary = Object.assign({}, source.returnSummary || {}, {
      totalReturnedQuantity: totalReturnedQuantity,
      totalReturnedAmount: totalReturnedAmount,
      originalTotalAmount: totals.totalAmount,
      adjustedTotalAmount: Math.max(0, totals.totalAmount - totalReturnedAmount)
    });
  }

  return Object.assign({}, source, totals);
}

function validateEditableItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return "Invoice must have at least one item.";
  }

  for (var index = 0; index < items.length; index += 1) {
    var item = items[index] || {};
    if (safeNumber(item.quantity, 0) <= 0) {
      return "Quantity must be a positive number.";
    }
    if (safeNumber(item.quantity, 0) < getItemReturnedQuantity(item)) {
      return "Quantity cannot be less than the returned quantity.";
    }
  }

  return "";
}

export {
  buildInvoiceItemFromProduct,
  getInvoiceItemName,
  getItemAdjustedTotal,
  getItemOriginalTotal,
  getItemRemainingQuantity,
  getItemReturnedQuantity,
  makeLineItemId,
  normalizeInvoiceItemReturnFields,
  normalizeInvoiceItemsForEditing,
  recalculateInvoiceTotals,
  safeNumber,
  validateEditableItems
};
