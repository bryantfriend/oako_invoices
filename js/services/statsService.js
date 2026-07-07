import { getReturnState } from "../core/returnStatus.js";
import { getAnalyticsStatus, getMillis, getRevenueTrendTimestamp, isArchivedRecord } from "../core/orderRecordHelpers.js";

function safeNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function getRecordId(record = {}) {
    return record.id || record.invoiceId || record.orderId || record.deliveryId || '';
}

function toDate(value, fallback = new Date(0)) {
    if (!value) return fallback;
    if (value.toDate) return value.toDate();
    if (value.seconds) return new Date(value.seconds * 1000);
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? fallback : date;
}

function isDeletedOrCancelledRecord(record) {
    const status = String(record?.status || "").toLowerCase();

    return Boolean(
        record?.isDeleted ||
        record?.deleted ||
        record?.softDeleted ||
        record?.archivedDeleted ||
        record?.deletedAt ||
        status === "deleted" ||
        status === "cancelled" ||
        status === "canceled"
    );
}

function getProductName(item = {}, parentItem = {}) {
    return item.productName || item.name || item.name_en || item.name_ru ||
        parentItem.productName || parentItem.name || parentItem.name_en || parentItem.name_ru ||
        item.productId || item.lineItemId || 'Unknown product';
}

function findParentItem(record = {}, returnItem = {}) {
    const items = Array.isArray(record.items) ? record.items : [];
    const productId = returnItem.productId || returnItem.id || '';
    const lineItemId = returnItem.lineItemId || '';

    return items.find(item => {
        return (lineItemId && item.lineItemId === lineItemId) ||
            (productId && (item.productId === productId || item.id === productId));
    }) || {};
}

function getUnitPrice(returnItem = {}, parentItem = {}) {
    if (returnItem.unitPrice !== undefined) return safeNumber(returnItem.unitPrice);
    if (returnItem.price !== undefined) return safeNumber(returnItem.price);
    return safeNumber(parentItem.price);
}

function getCustomerName(record = {}) {
    return record.customerName || record.partnerName || record.companyName || record.customer || 'Unknown customer';
}

function getItemQuantity(item = {}) {
    if (item.adjustedQuantity !== undefined) return safeNumber(item.adjustedQuantity);
    if (item.quantity !== undefined) return safeNumber(item.quantity);
    if (item.requestedQuantity !== undefined) return safeNumber(item.requestedQuantity);
    return 0;
}

function getReturnEventDate(returnEvent) {
    return toDate(returnEvent?.createdAt || returnEvent?.returnedAt || returnEvent?.updatedAt);
}

function buildReturnDedupeKey(event = {}) {
    if (event.returnId) {
        return `id:${event.returnId}`;
    }

    const parentId = event.orderId || event.invoiceId || event.deliveryId || '';
    const returnDay = getReturnEventDate(event).toISOString().split('T')[0];

    return [
        'fallback',
        parentId,
        event.productId || event.productName || '',
        returnDay,
        event.returnedQuantity || 0,
        event.returnAmount || 0
    ].join('|');
}

function normalizeInvoiceReturnEvents(invoice = {}) {
    if (isDeletedOrCancelledRecord(invoice)) {
        return [];
    }

    const invoiceId = invoice.id || invoice.invoiceId || '';
    const orderId = invoice.orderId || '';
    const events = [];

    (Array.isArray(invoice.returns) ? invoice.returns : []).forEach(returnRecord => {
        const source = String(returnRecord.source || returnRecord.returnedBy || '').toLowerCase() === 'courier'
            ? 'courier'
            : 'invoice';
        const createdAt = returnRecord.createdAt || returnRecord.returnedAt || invoice.returnedAt || invoice.updatedAt;
        const returnId = returnRecord.returnId || returnRecord.id || '';

        (returnRecord.items || []).forEach(item => {
            const parentItem = findParentItem(invoice, item);
            const returnedQuantity = safeNumber(item.returnedQuantity !== undefined ? item.returnedQuantity : item.quantity);
            if (returnedQuantity <= 0) return;

            const unitPrice = getUnitPrice(item, parentItem);
            const returnAmount = item.returnAmount !== undefined
                ? safeNumber(item.returnAmount)
                : unitPrice * returnedQuantity;

            events.push({
                returnId,
                source,
                invoiceId,
                orderId,
                deliveryId: returnRecord.deliveryId || invoice.deliveryId || '',
                courierId: returnRecord.courierId || invoice.courierId || '',
                courierName: returnRecord.courierName || invoice.courierName || (source === 'courier' ? invoice.returnedBy : ''),
                customerName: getCustomerName(invoice),
                createdAt,
                productId: item.productId || parentItem.productId || item.lineItemId || '',
                productName: getProductName(item, parentItem),
                returnedQuantity,
                unitPrice,
                returnAmount
            });
        });
    });

    return events;
}

function normalizeCourierReturnEvents(record = {}) {
    if (isDeletedOrCancelledRecord(record)) {
        return [];
    }

    const invoiceId = record.invoiceId || (record.invoiceNumber ? getRecordId(record) : '');
    const orderId = record.orderId || (!record.invoiceNumber ? getRecordId(record) : '');
    const deliveryId = record.deliveryId || '';
    const courierId = record.courierId || '';
    const courierName = record.courierName || record.returnedBy || '';
    const createdAt = record.returnedAt || record.orderItemsReturnedAt || record.updatedAt || record.createdAt;
    const sourceArrays = [];

    if (Array.isArray(record.courierReturns)) sourceArrays.push(...record.courierReturns);
    if (Array.isArray(record.deliveryReturns)) sourceArrays.push(...record.deliveryReturns);
    if (Array.isArray(record.returnItems)) {
        sourceArrays.push({
            returnId: record.returnId || '',
            createdAt,
            items: record.returnItems,
            courierId,
            courierName
        });
    }
    if (Array.isArray(record.returns)) {
        record.returns
            .filter(returnRecord => String(returnRecord.source || returnRecord.returnedBy || '').toLowerCase() === 'courier')
            .forEach(returnRecord => sourceArrays.push(returnRecord));
    }
    if (Array.isArray(record.items)) {
        const returnedItems = record.items
            .filter(item => safeNumber(item.returnQuantity) > 0)
            .map(item => ({
                productId: item.productId || item.id || '',
                quantity: safeNumber(item.returnQuantity)
            }));
        if (returnedItems.length > 0) {
            sourceArrays.push({
                returnId: record.returnId || '',
                createdAt,
                items: returnedItems,
                courierId,
                courierName
            });
        }
    }

    const events = [];
    sourceArrays.forEach(returnRecord => {
        const returnCreatedAt = returnRecord.createdAt || returnRecord.returnedAt || createdAt;
        (returnRecord.items || returnRecord.returnItems || returnRecord.returns || []).forEach(item => {
            const parentItem = findParentItem(record, item);
            const returnedQuantity = safeNumber(item.returnedQuantity !== undefined ? item.returnedQuantity : item.quantity);
            if (returnedQuantity <= 0) return;

            const unitPrice = getUnitPrice(item, parentItem);
            const returnAmount = item.returnAmount !== undefined
                ? safeNumber(item.returnAmount)
                : unitPrice * returnedQuantity;

            events.push({
                returnId: returnRecord.returnId || returnRecord.id || '',
                source: 'courier',
                invoiceId,
                orderId,
                deliveryId: returnRecord.deliveryId || deliveryId,
                courierId: returnRecord.courierId || courierId,
                courierName: returnRecord.courierName || courierName,
                customerName: getCustomerName(record),
                createdAt: returnCreatedAt,
                productId: item.productId || parentItem.productId || item.lineItemId || '',
                productName: getProductName(item, parentItem),
                returnedQuantity,
                unitPrice,
                returnAmount
            });
        });
    });

    return events;
}

function aggregateReturnAnalytics(returnEvents = [], salesAnalytics = {}) {
    const byDate = {};
    const byProduct = {};
    const byCourier = {};
    const byCustomer = {};
    const bySource = {};
    const returnedParents = new Set();
    let totalReturnedQuantity = 0;
    let totalReturnedAmount = 0;

    returnEvents.forEach(event => {
        const returnDate = getReturnEventDate(event);
        const dateKey = returnDate.toISOString().split('T')[0];
        const productId = event.productId || event.productName || 'unknown';
        const productName = event.productName || productId;
        const source = event.source || 'invoice';
        const courierKey = event.courierId || event.courierName || 'unknown';
        const courierName = event.courierName || 'Unknown courier';
        const customerName = event.customerName || 'Unknown customer';
        const customerKey = customerName.toLowerCase();
        const quantity = safeNumber(event.returnedQuantity);
        const amount = safeNumber(event.returnAmount);
        const parentKey = event.invoiceId || event.orderId || event.deliveryId || event.returnId;

        if (!byDate[dateKey]) {
            byDate[dateKey] = { date: dateKey, quantity: 0, amount: 0 };
        }
        if (!byProduct[productId]) {
            byProduct[productId] = { productId, productName, quantity: 0, amount: 0 };
        }
        if (source === 'courier' && !byCourier[courierKey]) {
            byCourier[courierKey] = { courierId: event.courierId || '', courierName, quantity: 0, amount: 0 };
        }
        if (!byCustomer[customerKey]) {
            byCustomer[customerKey] = { customerName, quantity: 0, amount: 0 };
        }
        if (!bySource[source]) {
            bySource[source] = { source, label: source === 'courier' ? 'Courier returns' : 'Invoice returns', quantity: 0, amount: 0 };
        }

        totalReturnedQuantity += quantity;
        totalReturnedAmount += amount;
        byDate[dateKey].quantity += quantity;
        byDate[dateKey].amount += amount;
        byProduct[productId].quantity += quantity;
        byProduct[productId].amount += amount;
        if (source === 'courier') {
            byCourier[courierKey].quantity += quantity;
            byCourier[courierKey].amount += amount;
        }
        byCustomer[customerKey].quantity += quantity;
        byCustomer[customerKey].amount += amount;
        bySource[source].quantity += quantity;
        bySource[source].amount += amount;
        if (parentKey) returnedParents.add(parentKey);
    });

    const byDateRows = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
    const byProductRows = Object.values(byProduct).sort((a, b) => {
        if (b.quantity !== a.quantity) return b.quantity - a.quantity;
        return b.amount - a.amount;
    }).map(row => {
        const salesRow = salesAnalytics.byProduct && salesAnalytics.byProduct[row.productId] ? salesAnalytics.byProduct[row.productId] : {};
        const soldQuantity = safeNumber(salesRow.quantity, 0);
        return Object.assign({}, row, {
            soldQuantity,
            returnPercent: soldQuantity > 0 ? (row.quantity / soldQuantity) * 100 : 0
        });
    });
    const byCourierRows = Object.values(byCourier).sort((a, b) => {
        if (b.quantity !== a.quantity) return b.quantity - a.quantity;
        return b.amount - a.amount;
    });
    const byCustomerRows = Object.values(byCustomer).sort((a, b) => {
        if (b.quantity !== a.quantity) return b.quantity - a.quantity;
        return b.amount - a.amount;
    });
    const bySourceRows = Object.values(bySource).sort((a, b) => {
        if (a.source === b.source) return 0;
        return a.source === 'invoice' ? -1 : 1;
    });

    return {
        totalReturnedQuantity,
        totalReturnedAmount,
        totalSoldQuantity: safeNumber(salesAnalytics.totalQuantity, 0),
        returnPercent: safeNumber(salesAnalytics.totalQuantity, 0) > 0
            ? (totalReturnedQuantity / safeNumber(salesAnalytics.totalQuantity, 0)) * 100
            : 0,
        returnedOrdersCount: returnedParents.size,
        byDate: byDateRows,
        byProduct: byProductRows,
        byCourier: byCourierRows,
        byCustomer: byCustomerRows,
        bySource: bySourceRows,
        labels: byDateRows.map(row => row.date.split('-').slice(1).join('/')),
        quantities: byDateRows.map(row => row.quantity),
        amounts: byDateRows.map(row => row.amount)
    };
}

function buildSalesAnalytics(records = []) {
    const byProduct = {};
    let totalQuantity = 0;

    records.forEach(record => {
        if (isDeletedOrCancelledRecord(record)) return;

        (Array.isArray(record.items) ? record.items : []).forEach(item => {
            const productId = item.productId || item.id || item.name || item.productName || 'unknown';
            const productName = getProductName(item);
            const quantity = getItemQuantity(item);
            if (quantity <= 0) return;

            if (!byProduct[productId]) {
                byProduct[productId] = {
                    productId,
                    productName,
                    quantity: 0
                };
            }

            byProduct[productId].quantity += quantity;
            totalQuantity += quantity;
        });
    });

    return {
        byProduct,
        totalQuantity
    };
}

export const statsService = {
    /**
     * Calculates stats for a given period and compares with the previous period
     * @param {Array} orders - All orders
     * @param {string} period - 'today', '7d', '30d', 'all'
     */
    getDashboardStats(orders, period = '30d', revenueGranularity = 'day', returnInvoices = []) {
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        let currentRange = { start: null, end: now };
        let prevRange = { start: null, end: null };

        if (typeof period === 'object' && period.start && period.end) {
            currentRange.start = new Date(period.start);
            currentRange.end = new Date(period.end);
            // Previous range is same duration backwards
            const diff = currentRange.end - currentRange.start;
            prevRange.end = new Date(currentRange.start.getTime() - 1);
            prevRange.start = new Date(prevRange.end.getTime() - diff);
        } else {
            switch (period) {
                case 'today':
                    currentRange.start = startOfToday;
                    prevRange.end = new Date(startOfToday.getTime() - 1);
                    prevRange.start = new Date(startOfToday.getTime() - (24 * 60 * 60 * 1000));
                    break;
                case '7d':
                    currentRange.start = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
                    prevRange.end = new Date(currentRange.start.getTime() - 1);
                    prevRange.start = new Date(currentRange.start.getTime() - (7 * 24 * 60 * 60 * 1000));
                    break;
                case '30d':
                    currentRange.start = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
                    prevRange.end = new Date(currentRange.start.getTime() - 1);
                    prevRange.start = new Date(currentRange.start.getTime() - (30 * 24 * 60 * 60 * 1000));
                    break;
                default: // 'all'
                    currentRange.start = new Date(0);
                    prevRange = null; // No comparison for 'all'
            }
        }

        const currentOrders = this._filterByDate(orders, currentRange.start, currentRange.end);
        const prevOrders = prevRange ? this._filterByDate(orders, prevRange.start, prevRange.end) : [];

        const currentMetrics = this._calculateMetrics(currentOrders);
        const prevMetrics = this._calculateMetrics(prevOrders);

        return {
            period,
            metrics: {
                orders: {
                    value: currentMetrics.count,
                    delta: this._calculateDelta(currentMetrics.count, prevMetrics.count)
                },
                revenue: {
                    value: currentMetrics.revenue,
                    delta: this._calculateDelta(currentMetrics.revenue, prevMetrics.revenue)
                },
                outstanding: {
                    value: currentMetrics.outstanding,
                    delta: this._calculateDelta(currentMetrics.outstanding, prevMetrics.outstanding, true) // inverted logic (lower is better)
                },
                aov: {
                    value: currentMetrics.count > 0 ? currentMetrics.revenue / currentMetrics.count : 0,
                    delta: this._calculateDelta(
                        currentMetrics.count > 0 ? currentMetrics.revenue / currentMetrics.count : 0,
                        prevMetrics.count > 0 ? prevMetrics.revenue / prevMetrics.count : 0
                    )
                }
            },
            overview: this.getRevenueBreakdown(orders),
            overdueCustomers: this.getTopOverdueCustomers(orders),
            topOrders: this.getTopOrders(orders),
            charts: {
                revenueOverTime: this._getRevenueOverTime(currentOrders, period, revenueGranularity),
                unitDemandOverTime: this._getUnitDemandOverTime(currentOrders, period),
                statusPipeline: this._getStatusPipeline(orders),
                topProducts: this._getTopProducts(currentOrders),
                topCategories: this._getTopCategories(currentOrders),
                topProductsByCategory: this._getTopProductsByCategory(currentOrders),
                returnedItems: this.getReturnedItemsAnalytics(returnInvoices, currentRange)
            }
        };
    },

    _filterByDate(orders, start, end) {
        return orders.filter(function(order) {
            var millis = getRevenueTrendTimestamp(order) || getMillis(order && order.updatedAt) || getMillis(order && order.localUpdatedAt) || getMillis(order && order.archivedAt);
            if (!millis) return false;
            var date = new Date(millis);
            return date >= start && date <= end;
        });
    },

    _calculateMetrics(orders) {
        const confirmedStati = ['confirmed', 'fulfilled', 'fullfilled', 'paid'];
        const outstandingStati = ['confirmed', 'fulfilled', 'fullfilled'];

        return {
            count: orders.length,
            revenue: orders.filter(o => confirmedStati.includes(getAnalyticsStatus(o))).reduce((sum, o) => sum + (o.totalAmount || 0), 0),
            outstanding: orders.filter(o => outstandingStati.includes(getAnalyticsStatus(o))).reduce((sum, o) => sum + (o.totalAmount || 0), 0)
        };
    },

    _calculateDelta(curr, prev, inverted = false) {
        if (!prev || prev === 0) return curr > 0 ? 100 : 0;
        const delta = ((curr - prev) / prev) * 100;
        return parseFloat(delta.toFixed(1));
    },

    _getOrderDate(order) {
        var millis = getRevenueTrendTimestamp(order);
        return millis ? new Date(millis) : new Date();
    },

    _getReturnDate(returnRecord) {
        return getReturnEventDate(returnRecord);
    },

    _startOfBucket(date, granularity = 'day') {
        const bucket = new Date(date);
        bucket.setHours(0, 0, 0, 0);

        if (granularity === 'week') {
            const day = bucket.getDay();
            bucket.setDate(bucket.getDate() - (day === 0 ? 6 : day - 1));
        } else if (granularity === 'month') {
            bucket.setDate(1);
        }

        return bucket;
    },

    _addBucket(date, granularity = 'day') {
        const next = new Date(date);
        if (granularity === 'week') {
            next.setDate(next.getDate() + 7);
        } else if (granularity === 'month') {
            next.setMonth(next.getMonth() + 1);
        } else {
            next.setDate(next.getDate() + 1);
        }
        return next;
    },

    _bucketLabel(date, granularity = 'day') {
        if (granularity === 'month') {
            return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        }
        if (granularity === 'week') {
            return `Week of ${date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}`;
        }
        return date.toISOString().split('T')[0].split('-').slice(1).join('/');
    },

    _getRevenueOverTime(orders, period, granularity = 'day') {
        const now = new Date();
        let days;
        let startDate;
        let endDate = now;

        if (typeof period === 'object' && period.start && period.end) {
            startDate = new Date(period.start);
            endDate = new Date(period.end);
            const diffTime = Math.abs(endDate - startDate);
            days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        } else {
            days = period === '7d' ? 7 : period === '30d' ? 30 : period === 'today' ? 1 : 30;
            startDate = new Date(now.getTime() - ((days - 1) * 24 * 60 * 60 * 1000));
        }

        const groups = {};
        const labels = [];

        const startBucket = this._startOfBucket(startDate, granularity);
        const endBucket = this._startOfBucket(endDate, granularity);

        for (let d = startBucket; d <= endBucket; d = this._addBucket(d, granularity)) {
            const key = d.toISOString().split('T')[0];
            groups[key] = { gross: 0, confirmedRevenue: 0, paid: 0, outstanding: 0, orders: 0 };
            labels.push(key);
        }

        orders.forEach(o => {
            const date = this._getOrderDate(o);
            const key = this._startOfBucket(date, granularity).toISOString().split('T')[0];
            if (groups[key]) {
                const amount = o.totalAmount || 0;
                const status = getAnalyticsStatus(o);
                if (status === 'paid') groups[key].paid += amount;
                else if (['confirmed', 'fulfilled', 'fullfilled'].includes(status)) groups[key].outstanding += amount;
                if (['confirmed', 'fulfilled', 'fullfilled', 'paid'].includes(status)) {
                    groups[key].gross += amount;
                    groups[key].confirmedRevenue += amount;
                    groups[key].orders += 1;
                }
            }
        });

        return {
            labels: labels.map(l => this._bucketLabel(new Date(`${l}T00:00:00`), granularity)),
            gross: labels.map(k => groups[k].gross),
            confirmedRevenue: labels.map(k => groups[k].confirmedRevenue),
            paid: labels.map(k => groups[k].paid),
            outstanding: labels.map(k => groups[k].outstanding),
            orders: labels.map(k => groups[k].orders)
        };
    },

    _getUnitDemandOverTime(orders, period) {
        const revenue = this._getRevenueOverTime(orders, period);
        const now = new Date();
        let days;
        let startDate;

        if (typeof period === 'object' && period.start && period.end) {
            startDate = new Date(period.start);
            const diffTime = Math.abs(new Date(period.end) - startDate);
            days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        } else {
            days = period === '7d' ? 7 : period === '30d' ? 30 : period === 'today' ? 1 : 30;
            startDate = new Date(now.getTime() - ((days - 1) * 24 * 60 * 60 * 1000));
        }

        const groups = {};
        const keys = [];
        for (let i = 0; i < days; i++) {
            const d = new Date(startDate.getTime() + (i * 24 * 60 * 60 * 1000));
            const key = d.toISOString().split('T')[0];
            groups[key] = { units: 0 };
            keys.push(key);
        }

        orders.forEach(order => {
            const date = order.orderDate ? new Date(order.orderDate) : (order.createdAt?.toDate ? order.createdAt.toDate() : new Date());
            const key = date.toISOString().split('T')[0];
            if (!groups[key]) return;

            (order.items || []).forEach(item => {
                const qty = item.adjustedQuantity !== undefined ? item.adjustedQuantity : item.quantity;
                groups[key].units += qty || 0;
            });
        });

        return {
            labels: revenue.labels,
            data: keys.map(k => groups[k].units)
        };
    },

    _getStatusPipeline(orders) {
        const stages = [
            { key: 'draft', label: 'Draft' },
            { key: 'pending', label: 'Pending' },
            { key: 'confirmed', label: 'Confirmed' },
            { key: 'partially_returned', label: 'Partially Returned' },
            { key: 'returned', label: 'Returned' },
            { key: 'fulfilled', label: 'Fulfilled' },
            { key: 'paid', label: 'Paid' },
            { key: 'archived', label: 'Archived' }
        ];

        const counts = {};
        stages.forEach(stage => {
            counts[stage.key] = 0;
        });

        orders.forEach(order => {
            const returnState = getReturnState(order);
            const status = isArchivedRecord(order) ? 'archived' : (returnState === 'partial'
                ? 'partially_returned'
                : (returnState === 'full' ? 'returned' : (getAnalyticsStatus(order) === 'fullfilled' ? 'fulfilled' : getAnalyticsStatus(order))));
            if (counts[status] !== undefined) {
                counts[status] += 1;
            }
        });

        return {
            labels: stages.map(stage => stage.label),
            data: stages.map(stage => counts[stage.key])
        };
    },

    getReturnedItemsAnalytics(records = [], range = {}) {
        const invoices = Array.isArray(records) ? records : (records.invoices || []);
        const orders = Array.isArray(records) ? [] : (records.orders || []);
        const deliveries = Array.isArray(records) ? [] : (records.deliveries || []);
        const deduped = {};

        invoices.forEach(invoice => {
            normalizeInvoiceReturnEvents(invoice)
                .concat(normalizeCourierReturnEvents(invoice))
                .forEach(event => {
                    const returnDate = getReturnEventDate(event);
                    if (range.start && returnDate < range.start) return;
                    if (range.end && returnDate > range.end) return;
                    deduped[buildReturnDedupeKey(event)] = event;
                });
        });

        orders.concat(deliveries).forEach(record => {
            normalizeCourierReturnEvents(record).forEach(event => {
                const returnDate = getReturnEventDate(event);
                if (range.start && returnDate < range.start) return;
                if (range.end && returnDate > range.end) return;
                deduped[buildReturnDedupeKey(event)] = event;
            });
        });

        const salesAnalytics = buildSalesAnalytics(invoices.concat(orders, deliveries));
        const analytics = aggregateReturnAnalytics(Object.values(deduped), salesAnalytics);
        const returnStateByParent = {};
        invoices.concat(orders, deliveries).forEach(record => {
            const returnState = getReturnState(record);
            if (returnState === 'none') return;
            const key = record.orderId || record.invoiceId || record.id || record.deliveryId || '';
            if (!key) return;
            if (returnState === 'full' || !returnStateByParent[key]) {
                returnStateByParent[key] = returnState;
            }
        });
        const returnStates = Object.values(returnStateByParent);

        return Object.assign({}, analytics, {
            partiallyReturnedCount: returnStates.filter(returnState => returnState === 'partial').length,
            fullyReturnedCount: returnStates.filter(returnState => returnState === 'full').length
        });
    },

    _getTopProducts(orders, categoryId = null) {
        const products = {};

        orders.forEach(order => {
            (order.items || []).forEach(item => {
                if (categoryId && (item.categoryId || 'uncategorized') !== categoryId) return;

                const name = item.name || item.name_en || item.name_ru || 'Unknown product';
                const qty = item.adjustedQuantity !== undefined ? item.adjustedQuantity : item.quantity;
                if (!qty) return;

                if (!products[name]) {
                    products[name] = { units: 0, revenue: 0, id: item.productId || name };
                }

                products[name].units += qty;
                products[name].revenue += (item.price || 0) * qty;
            });
        });

        const sorted = Object.entries(products)
            .sort(([, a], [, b]) => {
                if (b.units !== a.units) return b.units - a.units;
                return b.revenue - a.revenue;
            })
            .slice(0, 5);

        return {
            labels: sorted.map(([name]) => name.length > 18 ? name.slice(0, 16) + '...' : name),
            data: sorted.map(([, stats]) => stats.units),
            revenue: sorted.map(([, stats]) => stats.revenue),
            ids: sorted.map(([, stats]) => stats.id),
            fullLabels: sorted.map(([name]) => name)
        };
    },

    _getTopCategories(orders) {
        const categories = {};

        orders.forEach(order => {
            (order.items || []).forEach(item => {
                const categoryId = item.categoryId || 'uncategorized';
                const categoryName = item.categoryName || 'Uncategorized';
                const qty = item.adjustedQuantity !== undefined ? item.adjustedQuantity : item.quantity;
                if (!qty) return;

                if (!categories[categoryId]) {
                    categories[categoryId] = { name: categoryName, units: 0, revenue: 0 };
                }

                categories[categoryId].units += qty;
                categories[categoryId].revenue += (item.price || 0) * qty;
            });
        });

        const sorted = Object.entries(categories)
            .sort(([, a], [, b]) => {
                if (b.units !== a.units) return b.units - a.units;
                return b.revenue - a.revenue;
            })
            .slice(0, 5);

        return {
            labels: sorted.map(([, stats]) => stats.name.length > 18 ? stats.name.slice(0, 16) + '...' : stats.name),
            data: sorted.map(([, stats]) => stats.units),
            revenue: sorted.map(([, stats]) => stats.revenue),
            ids: sorted.map(([id]) => id),
            fullLabels: sorted.map(([, stats]) => stats.name)
        };
    },

    getTopProductsForCategory(orders, categoryId) {
        return this._getTopProducts(orders, categoryId);
    },

    _getTopProductsByCategory(orders) {
        const categoryIds = new Set();

        orders.forEach(order => {
            (order.items || []).forEach(item => {
                categoryIds.add(item.categoryId || 'uncategorized');
            });
        });

        return [...categoryIds].reduce((result, categoryId) => {
            result[categoryId] = this._getTopProducts(orders, categoryId);
            return result;
        }, {});
    },


    getRevenueBreakdown(orders) {
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfWeek = new Date(now.getTime() - (now.getDay() * 24 * 60 * 60 * 1000));
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const filterPaid = (start) => orders.filter(o => {
            const d = o.orderDate ? new Date(o.orderDate) : (o.createdAt?.toDate ? o.createdAt.toDate() : new Date(0));
            return getAnalyticsStatus(o) === 'paid' && d >= start;
        }).reduce((sum, o) => sum + (o.totalAmount || 0), 0);

        const oldestUnpaid = orders
            .filter(o => ['confirmed', 'fulfilled', 'fullfilled'].includes(getAnalyticsStatus(o)))
            .sort((a, b) => {
                const da = a.orderDate ? new Date(a.orderDate).getTime() : 0;
                const db = b.orderDate ? new Date(b.orderDate).getTime() : 0;
                return da - db;
            })[0];

        return {
            today: filterPaid(startOfToday),
            week: filterPaid(startOfWeek),
            month: filterPaid(startOfMonth),
            oldestUnpaid: oldestUnpaid ? { amount: oldestUnpaid.totalAmount, date: oldestUnpaid.orderDate } : null
        };
    },

    getTopOverdueCustomers(orders) {
        const customers = {};
        orders.filter(o => ['confirmed', 'fulfilled', 'fullfilled'].includes(getAnalyticsStatus(o)) && (o.agingDays || 0) > 0).forEach(o => {
            if (!customers[o.customerName]) {
                customers[o.customerName] = { name: o.customerName, amount: 0, maxAge: 0 };
            }
            customers[o.customerName].amount += (o.totalAmount || 0);
            customers[o.customerName].maxAge = Math.max(customers[o.customerName].maxAge, o.agingDays);
        });

        return Object.values(customers)
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 5);
    },

    getTopOrders(orders) {
        return [...orders]
            .sort((a, b) => (b.totalAmount || 0) - (a.totalAmount || 0))
            .slice(0, 3);
    },

    getPredictiveSignals(orders) {
        const signals = [];
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        // 1. No orders today
        const ordersToday = orders.filter(o => {
            const date = o.orderDate ? new Date(o.orderDate) : (o.createdAt?.toDate ? o.createdAt.toDate() : new Date());
            return date >= startOfToday;
        });
        if (ordersToday.length === 0) {
            signals.push({ type: 'warning', text: "No orders recorded today yet." });
        }

        // 2. Unusually large orders
        const confirmedOrders = orders.filter(o => ['confirmed', 'fulfilled', 'fullfilled', 'paid'].includes(getAnalyticsStatus(o)));
        if (confirmedOrders.length > 5) {
            const avg = confirmedOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0) / confirmedOrders.length;
            const recentLarge = confirmedOrders
                .filter(o => (o.totalAmount || 0) > avg * 2)
                .slice(0, 1);
            if (recentLarge.length > 0) {
                signals.push({ type: 'info', text: `Unusual order size from ${recentLarge[0].customerName} (${recentLarge[0].totalAmount} сом).` });
            }
        }

        // 3. Customer payment lag
        // (Simple heuristic: if they have any unpaid older than their average)
        // For now, just flag any critical overdue as a signal if not already in alert strip
        const critical = orders.filter(o => ['confirmed', 'fulfilled', 'fullfilled'].includes(getAnalyticsStatus(o)) && (o.agingDays || 0) >= 30);
        if (critical.length > 0) {
            signals.push({ type: 'danger', text: `${critical.length} customer(s) are at high risk (>30 days overdue).` });
        }

        return signals;
    }
};
