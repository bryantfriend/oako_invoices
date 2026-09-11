import {
    normalizeOrderItemPricing,
    calculateOrderTotals,
    buildPricedOrderItemFromProduct,
} from './pricing.js';
import { getLocalDateKey } from '../services/operationsPlanningService.js';

export function createWorkflowId() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
}

export function normalizeWorkflowOrder(draft) {
    var items = (draft.items || [])
        .filter(function (item) {
            return Number(item.quantity) > 0;
        })
        .map(function (item) {
            var copy = Object.assign({}, item, { quantity: Number(item.quantity) });
            if (copy.adjustedQuantity !== undefined) copy.adjustedQuantity = copy.quantity;
            return normalizeOrderItemPricing(copy);
        });
    var totals = calculateOrderTotals(items);
    return {
        customerId: String(draft.customerId || ''),
        customerName: String(draft.customerName || '').trim(),
        orderDate: draft.orderDate,
        notes: String(draft.notes || '').trim(),
        items: items,
        selectedPriceMode: draft.selectedPriceMode || 'retail',
        subtotal: totals.subtotal,
        totalAmount: totals.totalAmount,
        status: 'draft',
    };
}

function customerMatches(order, customer) {
    if (order.customerId && customer.id) return order.customerId === customer.id;
    return (
        String(order.customerName || '')
            .trim()
            .toLowerCase() ===
        String(customer.companyName || customer.name || '')
            .trim()
            .toLowerCase()
    );
}

export function buildDailyBatchRows(customers, orders, products, date, priceMode) {
    var catalog = {};
    products.forEach(function (product) {
        catalog[product.id] = product;
    });
    return customers
        .map(function (customer) {
            var history = orders
                .filter(function (order) {
                    return (
                        customerMatches(order, customer) &&
                        order.status !== 'cancelled' &&
                        Array.isArray(order.items) &&
                        order.items.length
                    );
                })
                .sort(function (a, b) {
                    return String(b.orderDate || '').localeCompare(String(a.orderDate || ''));
                });
            var existing = history.find(function (order) {
                return getLocalDateKey(order.orderDate) === date && !order.archived;
            });
            var source =
                existing ||
                history.find(function (order) {
                    return getLocalDateKey(order.orderDate) < date;
                });
            if (!source) return null;
            var warnings = [];
            var items = source.items.map(function (item) {
                // Existing orders retain their reviewed quantities and price snapshots.
                if (existing)
                    return Object.assign({}, item, {
                        quantity: item.adjustedQuantity !== undefined ? item.adjustedQuantity : item.quantity,
                    });
                var product = catalog[item.productId];
                if (
                    !product ||
                    product.active === false ||
                    product.isActive === false ||
                    item.productMatchPending
                ) {
                    warnings.push(
                        (item.name || 'Product') +
                            ': unavailable or needs a product match. Remove it or update the catalog first.',
                    );
                    return Object.assign({}, item, { productMatchPending: true });
                }
                var next;
                try {
                    next = buildPricedOrderItemFromProduct(
                        product,
                        priceMode || source.selectedPriceMode || 'retail',
                        Number(item.quantity) || 1,
                    );
                } catch (error) {
                    warnings.push((item.name || 'Product') + ': ' + error.message);
                    return Object.assign({}, item, { productMatchPending: true });
                }
                if (
                    Number(next.unitPrice) !==
                    Number(item.unitPrice !== undefined ? item.unitPrice : item.price)
                ) {
                    warnings.push(next.name + ': current catalog price applied.');
                }
                return next;
            });
            return {
                requestId: customer.id
                    ? 'batch-' + date.replace(/-/g, '') + '-' + customer.id
                    : createWorkflowId(),
                customerId: customer.id || '',
                customerName: customer.companyName || customer.name,
                orderDate: date,
                notes: source.notes || '',
                selectedPriceMode: priceMode || source.selectedPriceMode || 'retail',
                items: items,
                warnings: warnings,
                existingOrderId: existing ? existing.id : '',
                selected: !existing,
                orderId: '',
                invoiceId: '',
                status: 'review',
                error: '',
            };
        })
        .filter(function (row) {
            return row !== null;
        });
}

export function suggestReturnQuantities(items, history) {
    return items
        .map(function (item, index) {
            var samples = [];
            history.forEach(function (order) {
                // Drafts have no completed outcome and must not dilute the return rate.
                var status = order.archived ? order.previousStatus || order.status : order.status;
                if (
                    [
                        'fulfilled',
                        'fullfilled',
                        'paid',
                        'completed',
                        'returned',
                        'partially_returned',
                        'fully_returned',
                    ].indexOf(status) === -1
                )
                    return;
                var line = (order.items || []).find(function (entry) {
                    return item.productId && entry.productId === item.productId;
                });
                if (!line || line.productMatchPending) return;
                var quantity =
                    Number(line.adjustedQuantity !== undefined ? line.adjustedQuantity : line.quantity) || 0;
                var returnLine = (order.returnItems || []).find(function (entry) {
                    return entry.productId === item.productId;
                });
                var returnQuantity =
                    line.returnedQuantity !== undefined ? line.returnedQuantity : line.returnQuantity;
                if (returnQuantity === undefined && returnLine) returnQuantity = returnLine.quantity;
                var returned = Math.min(quantity, Math.max(0, Number(returnQuantity) || 0));
                if (quantity > 0) samples.push({ quantity: quantity, returned: returned });
            });
            var ordered = samples.reduce(function (sum, row) {
                return sum + row.quantity;
            }, 0);
            var returned = samples.reduce(function (sum, row) {
                return sum + row.returned;
            }, 0);
            // Anchor to completed history so accepting a suggestion cannot compound reductions.
            var suggested = Math.max(1, Math.round((ordered - returned) / (samples.length || 1)));
            if (samples.length < 3 || returned === 0 || suggested >= Number(item.quantity)) return null;
            return {
                index: index,
                productId: item.productId,
                name: item.name || item.name_en,
                current: Number(item.quantity),
                suggested: suggested,
                samples: samples.length,
                returned: returned,
                ordered: ordered,
            };
        })
        .filter(function (row) {
            return row !== null;
        });
}

export function summarizeWorkflowEvents(events) {
    function median(type, field) {
        var values = events
            .filter(function (event) {
                return event.type === type && Number.isFinite(event[field]);
            })
            .map(function (event) {
                return event[field];
            })
            .sort(function (a, b) {
                return a - b;
            });
        if (!values.length) return null;
        var middle = Math.floor(values.length / 2);
        return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
    }
    function count(type) {
        return events.filter(function (event) {
            return event.type === type;
        }).length;
    }
    return {
        prepared: count('prepared'),
        failures: count('preparation_failed'),
        reprints: count('reprint'),
        corrections: count('correction'),
        entryMs: median('prepared', 'entryMs'),
        prepareMs: median('prepared', 'durationMs'),
        batchMs: median('batch', 'durationMs'),
        batches: count('batch'),
        sampleSize: events.length,
    };
}

export function buildBakeryProgress(orders, date) {
    var unique = {};
    orders.forEach(function (order) {
        if (
            order.id &&
            !order.archived &&
            ['cancelled', 'archived'].indexOf(order.status) === -1 &&
            getLocalDateKey(order.orderDate) === date
        )
            unique[order.id] = order;
    });
    var rows = Object.values(unique);
    var printed = rows.filter(function (order) {
        return order.isPrinted === true;
    }).length;
    return { total: rows.length, printed: printed, complete: rows.length > 0 && printed === rows.length };
}

export function createEntryTimer(initialMs, now) {
    var clock = now || Date.now;
    var total = Number(initialMs) || 0;
    var last = 0;
    return {
        touch: function () {
            var current = clock();
            // Only short intervals between interactions count; unattended tabs do not.
            if (last && current - last <= 30000) total += current - last;
            last = current;
            return total;
        },
        value: function () {
            return total;
        },
        pause: function () {
            last = 0;
        },
    };
}
