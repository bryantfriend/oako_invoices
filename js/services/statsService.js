export const statsService = {
    /**
     * Calculates stats for a given period and compares with the previous period
     * @param {Array} orders - All orders
     * @param {string} period - 'today', '7d', '30d', 'all'
     */
    getDashboardStats(orders, period = '30d') {
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
                revenueOverTime: this._getRevenueOverTime(currentOrders, period),
                ordersVsPayments: this._getOrdersVsPayments(currentOrders),
                aging: this._getAgingDistribution(orders), // Always current data for aging
                concentration: this._getCustomerConcentration(orders) // Always current data
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
        const confirmedStati = ['confirmed', 'fulfilled', 'paid'];
        const outstandingStati = ['confirmed', 'fulfilled'];

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

    _getRevenueOverTime(orders, period) {
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
        const labels = [];

        // Initialize all days in range
        for (let i = 0; i < days; i++) {
            const d = new Date(startDate.getTime() + (i * 24 * 60 * 60 * 1000));
            const key = d.toISOString().split('T')[0];
            groups[key] = { gross: 0, paid: 0, outstanding: 0, orders: 0 };
            labels.push(key);
        }

        orders.forEach(o => {
            const date = o.orderDate ? new Date(o.orderDate) : (o.createdAt?.toDate ? o.createdAt.toDate() : new Date());
            const key = date.toISOString().split('T')[0];
            if (groups[key]) {
                const amount = o.totalAmount || 0;
                if (o.status === 'paid') groups[key].paid += amount;
                else if (['confirmed', 'fulfilled'].includes(o.status)) groups[key].outstanding += amount;
                if (['confirmed', 'fulfilled', 'paid'].includes(o.status)) {
                    groups[key].gross += amount;
                    groups[key].orders += 1;
                }
            }
        });

        return {
            labels: labels.map(l => l.split('-').slice(1).join('/')), // MM/DD
            gross: labels.map(k => groups[k].gross),
            paid: labels.map(k => groups[k].paid),
            outstanding: labels.map(k => groups[k].outstanding),
            orders: labels.map(k => groups[k].orders)
        };
    },

    _getOrdersVsPayments(orders) {
        // Simple count comparison
        const createdCount = orders.length;
        const paidCount = orders.filter(o => o.status === 'paid').length;
        const confirmedCount = orders.filter(o => ['confirmed', 'fulfilled'].includes(o.status)).length;

        return {
            labels: ['Orders Created', 'Orders Confirmed', 'Orders Paid'],
            data: [createdCount, confirmedCount, paidCount]
        };
    },

    _getAgingDistribution(orders) {
        const agingData = { current: 0, week: 0, month: 0, monthPlus: 0 };

        orders.filter(o => ['confirmed', 'fulfilled'].includes(o.status)).forEach(o => {
            const age = (o.agingDays || 0);
            if (age >= 30) agingData.monthPlus += (o.totalAmount || 0);
            else if (age >= 8) agingData.month += (o.totalAmount || 0);
            else if (age >= 1) agingData.week += (o.totalAmount || 0);
            else agingData.current += (o.totalAmount || 0);
        });

        return {
            labels: ['Current', '1-7 Days', '8-30 Days', '30+ Days'],
            data: [agingData.current, agingData.week, agingData.month, agingData.monthPlus]
        };
    },

    _getCustomerConcentration(orders) {
        const customers = {};
        orders.forEach(o => {
            if (['confirmed', 'fulfilled', 'paid'].includes(o.status)) {
                const name = o.customerName || 'Unknown';
                customers[name] = (customers[name] || 0) + (o.totalAmount || 0);
            }
        });

        const sorted = Object.entries(customers)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5);

        return {
            labels: sorted.map(([name]) => name.length > 10 ? name.slice(0, 8) + '...' : name),
            data: sorted.map(([, amount]) => amount)
        };
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
            .filter(o => ['confirmed', 'fulfilled'].includes(o.status))
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
        orders.filter(o => ['confirmed', 'fulfilled'].includes(o.status) && (o.agingDays || 0) > 0).forEach(o => {
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
        const confirmedOrders = orders.filter(o => ['confirmed', 'fulfilled', 'paid'].includes(o.status));
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
        const critical = orders.filter(o => ['confirmed', 'fulfilled'].includes(o.status) && (o.agingDays || 0) >= 30);
        if (critical.length > 0) {
            signals.push({ type: 'danger', text: `${critical.length} customer(s) are at high risk (>30 days overdue).` });
        }

        return signals;
    }
};
