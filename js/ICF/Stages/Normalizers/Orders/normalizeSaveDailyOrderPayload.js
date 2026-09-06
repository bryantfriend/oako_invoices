import resultHelpers from "../../../engine/resultHelpers.js";
import { calculateOrderTotals, normalizeDefaultOrderPriceMode, normalizeOrderItemPricing } from "../../../../core/pricing.js";

function normalizeSaveDailyOrderPayload(intent) {
    var payload = intent.payload || {};
    var items = (Array.isArray(payload.items) ? payload.items : []).map(function(item) {
        var normalizedItem = Object.assign({}, item, {
            quantity: Math.max(0, Number(item && item.quantity) || 0)
        });
        // Daily Orders edits the effective quantity, including previously adjusted order lines.
        if (normalizedItem.adjustedQuantity !== undefined) {
            normalizedItem.adjustedQuantity = normalizedItem.quantity;
        }
        return normalizedItem;
    }).filter(function(item) {
        return item.quantity > 0;
    }).map(function(item) {
        return normalizeOrderItemPricing(item);
    });
    var totals = calculateOrderTotals(items);

    intent.payload = Object.assign({}, payload, {
        orderId: String(payload.orderId || '').trim(),
        customerId: String(payload.customerId || '').trim(),
        customerName: String(payload.customerName || '').trim(),
        orderDate: String(payload.orderDate || '').slice(0, 10),
        notes: String(payload.notes || '').trim(),
        selectedPriceMode: normalizeDefaultOrderPriceMode(payload.selectedPriceMode),
        items: items,
        subtotal: totals.subtotal,
        totalAmount: totals.totalAmount
    });
    return resultHelpers.success(intent);
}

export default {
    normalizeSaveDailyOrderPayload: normalizeSaveDailyOrderPayload
};
