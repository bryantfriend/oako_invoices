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

function makeLineItemId(productId) {
  return [
    "line",
    String(productId || "item").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24) || "item",
    Date.now().toString(36),
    Math.random().toString(36).slice(2, 8)
  ].join("-");
}

function normalizeInvoiceItem(item, index) {
  var source = item || {};
  var quantity = safeNumber(source.adjustedQuantity !== undefined ? source.adjustedQuantity : source.quantity, 0);
  var price = safeNumber(source.price, 0);
  var returnedQuantity = safeNumber(source.returnedQuantity, 0);
  var normalized = Object.assign({}, source, {
    lineItemId: source.lineItemId || makeLineItemId(source.productId || index),
    productId: source.productId || source.id || "",
    displayName: source.displayName || getInvoiceItemName(source),
    quantity: quantity,
    adjustedQuantity: quantity,
    price: price,
    total: price * quantity,
    returnedQuantity: returnedQuantity,
    returnedAmount: safeNumber(source.returnedAmount, 0)
  });

  return normalized;
}

function normalizeInvoiceItemsForEditing(invoice) {
  var sourceItems = invoice && Array.isArray(invoice.items) ? invoice.items : [];
  return sourceItems.map(normalizeInvoiceItem);
}

function buildInvoiceItemFromProduct(product, quantity) {
  var source = product || {};
  var itemQuantity = safeNumber(quantity, 1);
  var price = safeNumber(source.price, 0);
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
  }

  return "";
}

export {
  buildInvoiceItemFromProduct,
  getInvoiceItemName,
  makeLineItemId,
  normalizeInvoiceItemsForEditing,
  recalculateInvoiceTotals,
  safeNumber,
  validateEditableItems
};
