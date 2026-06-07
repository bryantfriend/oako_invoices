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
        return orders.filter(o => {
            const date = o.orderDate ? new Date(o.orderDate) : (o.createdAt?.toDate ? o.createdAt.toDate() : new Date(o.createdAt));
            return date >= start && date <= end;
        });
    },

    _calculateMetrics(orders) {
        const confirmedStati = ['confirmed', 'fulfilled', 'fullfilled', 'paid'];
        const outstandingStati = ['confirmed', 'fulfilled', 'fullfilled'];

        return {
            count: orders.length,
            revenue: orders.filter(o => confirmedStati.includes(o.status)).reduce((sum, o) => sum + (o.totalAmount || 0), 0),
            outstanding: orders.filter(o => outstandingStati.includes(o.status)).reduce((sum, o) => sum + (o.totalAmount || 0), 0)
        };
    },

    _calculateDelta(curr, prev, inverted = false) {
        if (!prev || prev === 0) return curr > 0 ? 100 : 0;
        const delta = ((curr - prev) / prev) * 100;
        return parseFloat(delta.toFixed(1));
    },

    _getOrderDate(order) {
        return order.orderDate ? new Date(order.orderDate) : (order.createdAt?.toDate ? order.createdAt.toDate() : new Date(order.createdAt || Date.now()));
    },

    _getReturnDate(returnRecord) {
        const value = returnRecord?.createdAt;
        if (!value) return new Date(0);
        if (value.toDate) return value.toDate();
        if (value.seconds) return new Date(value.seconds * 1000);
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? new Date(0) : date;
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
                if (o.status === 'paid') groups[key].paid += amount;
                else if (['confirmed', 'fulfilled', 'fullfilled'].includes(o.status)) groups[key].outstanding += amount;
                if (['confirmed', 'fulfilled', 'fullfilled', 'paid'].includes(o.status)) {
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
            { key: 'returned', label: 'Returned' },
            { key: 'fulfilled', label: 'Fulfilled' },
            { key: 'paid', label: 'Paid' }
        ];

        const counts = {};
        stages.forEach(stage => {
            counts[stage.key] = 0;
        });

        orders.forEach(order => {
            const status = order.status === 'fullfilled' ? 'fulfilled' : order.status;
            if (counts[status] !== undefined) {
                counts[status] += 1;
            }
        });

        return {
            labels: stages.map(stage => stage.label),
            data: stages.map(stage => counts[stage.key])
        };
    },

    getReturnedItemsAnalytics(invoices = [], range = {}) {
        const byDate = {};
        const byProduct = {};
        let totalReturnedQuantity = 0;
        let totalReturnedAmount = 0;

        invoices.forEach(invoice => {
            const returns = Array.isArray(invoice.returns) ? invoice.returns : [];
            returns.forEach(returnRecord => {
                const returnDate = this._getReturnDate(returnRecord);
                if (range.start && returnDate < range.start) return;
                if (range.end && returnDate > range.end) return;

                const dateKey = returnDate.toISOString().split('T')[0];
                if (!byDate[dateKey]) {
                    byDate[dateKey] = { date: dateKey, quantity: 0, amount: 0 };
                }

                (returnRecord.items || []).forEach(item => {
                    const quantity = Number(item.returnedQuantity) || 0;
                    const amount = Number(item.returnAmount) || 0;
                    const productId = item.productId || item.lineItemId || item.productName || 'unknown';
                    const productName = item.productName || productId;

                    totalReturnedQuantity += quantity;
                    totalReturnedAmount += amount;
                    byDate[dateKey].quantity += quantity;
                    byDate[dateKey].amount += amount;

                    if (!byProduct[productId]) {
                        byProduct[productId] = {
                            productId,
                            productName,
                            quantity: 0,
                            amount: 0
                        };
                    }
                    byProduct[productId].quantity += quantity;
                    byProduct[productId].amount += amount;
                });
            });
        });

        const byDateRows = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
        const byProductRows = Object.values(byProduct)
            .sort((a, b) => {
                if (b.quantity !== a.quantity) return b.quantity - a.quantity;
                return b.amount - a.amount;
            });

        return {
            totalReturnedQuantity,
            totalReturnedAmount,
            byDate: byDateRows,
            byProduct: byProductRows,
            labels: byDateRows.map(row => row.date.split('-').slice(1).join('/')),
            quantities: byDateRows.map(row => row.quantity),
            amounts: byDateRows.map(row => row.amount)
        };
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
            return o.status === 'paid' && d >= start;
        }).reduce((sum, o) => sum + (o.totalAmount || 0), 0);

        const oldestUnpaid = orders
            .filter(o => ['confirmed', 'fulfilled', 'fullfilled'].includes(o.status))
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
        orders.filter(o => ['confirmed', 'fulfilled', 'fullfilled'].includes(o.status) && (o.agingDays || 0) > 0).forEach(o => {
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
        const confirmedOrders = orders.filter(o => ['confirmed', 'fulfilled', 'fullfilled', 'paid'].includes(o.status));
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
        const critical = orders.filter(o => ['confirmed', 'fulfilled', 'fullfilled'].includes(o.status) && (o.agingDays || 0) >= 30);
        if (critical.length > 0) {
            signals.push({ type: 'danger', text: `${critical.length} customer(s) are at high risk (>30 days overdue).` });
        }

        return signals;
    }
};
