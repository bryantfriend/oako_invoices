import { getOrderDateKey } from "./dailyOrders.js";

function nonNegativeQuantity(value) {
    var quantity = Number(value);
    return Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
}

function roundQuantity(value) {
    return Math.round(value * 1000000) / 1000000;
}

function getInventoryOrderDate(order) {
    var date = getOrderDateKey(order);
    if (date) {
        return date;
    }
    // Older completed orders can lack a scheduled date.
    if (order.status === 'fulfilled' || order.status === 'paid') {
        return getOrderDateKey({ orderDate: order.fulfilledAt });
    }
    return '';
}

function buildInventoryOrderTotals(orders, date) {
    var totals = Object.create(null);
    (Array.isArray(orders) ? orders : []).forEach(function(order) {
        if (!order) {
            return;
        }
        var status = String(order.status || '').toLowerCase();
        if (status === 'cancelled' || status === 'canceled' || getInventoryOrderDate(order) !== date) {
            return;
        }
        // A saved draft reserves stock. Archiving preserves the order's business status.
        (Array.isArray(order.items) ? order.items : []).forEach(function(item) {
            if (!item || item.productMatchPending === true) {
                return;
            }
            // Legacy order items use id where current items use productId.
            var productId = String(item.productId || item.id || '').trim();
            if (!productId) {
                return;
            }
            var quantity = nonNegativeQuantity(item.adjustedQuantity !== undefined ? item.adjustedQuantity : item.quantity);
            var returned = Math.min(quantity, nonNegativeQuantity(item.returnedQuantity !== undefined ? item.returnedQuantity : item.returnQuantity));
            if (!totals[productId]) {
                totals[productId] = { ordered: 0, returned: 0 };
            }
            totals[productId].ordered = roundQuantity(totals[productId].ordered + quantity);
            totals[productId].returned = roundQuantity(totals[productId].returned + returned);
        });
    });
    return totals;
}

function getInventoryProductQuantities(record, orderTotals) {
    var source = record || {};
    var totals = orderTotals || {};
    var totalBaked = nonNegativeQuantity(source.totalBaked);
    var ordered = nonNegativeQuantity(totals.ordered);
    var returned = nonNegativeQuantity(totals.returned);
    return {
        totalBaked: totalBaked,
        ordered: ordered,
        returned: returned,
        left: roundQuantity(totalBaked - ordered + returned)
    };
}

export { buildInventoryOrderTotals, getInventoryProductQuantities };
