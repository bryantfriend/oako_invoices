function getDate(value) {
    if (!value) {
        return null;
    }

    if (typeof value.toDate === 'function') {
        return value.toDate();
    }

    var date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return null;
    }

    return date;
}

export function getLocalDateKey(value) {
    var date = getDate(value);
    if (!date) {
        return '';
    }

    var year = String(date.getFullYear());
    var month = String(date.getMonth() + 1).padStart(2, '0');
    var day = String(date.getDate()).padStart(2, '0');
    return year + '-' + month + '-' + day;
}

export function getTodayKey() {
    return getLocalDateKey(new Date());
}

function normalizeName(value) {
    return String(value || '').trim().toLowerCase();
}

function getCustomerName(customer) {
    var source = customer || {};
    return source.companyName || source.name || '';
}

export function buildCustomerIndex(customers) {
    var index = {};
    var rows = Array.isArray(customers) ? customers : [];
    var customerIndex = 0;

    while (customerIndex < rows.length) {
        var customer = rows[customerIndex] || {};
        var key = normalizeName(getCustomerName(customer));
        if (key) {
            index[key] = customer;
        }
        customerIndex = customerIndex + 1;
    }

    return index;
}

function getOutstandingAmount(order) {
    var source = order || {};
    var total = Number(source.totalAmount || source.total || 0);
    var amountPaid = Number(source.amountPaid || source.paidAmount || 0);
    var explicitBalance = Number(source.outstandingAmount || source.balanceDue || 0);

    if (explicitBalance > 0) {
        return explicitBalance;
    }

    return Math.max(0, total - amountPaid);
}

function getDueDate(order) {
    var source = order || {};
    return getDate(source.dueDate || source.orderDate || source.createdAt);
}

function getDueOffsetDays(order, nowValue) {
    var dueDate = getDueDate(order);
    var now = getDate(nowValue) || new Date();
    if (!dueDate) {
        return 0;
    }

    var dueDay = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.floor((today.getTime() - dueDay.getTime()) / 86400000);
}

function getCollectionRisk(ageDays) {
    if (ageDays >= 14) {
        return 'critical';
    }
    if (ageDays >= 7) {
        return 'high';
    }
    if (ageDays >= 1) {
        return 'due';
    }
    return 'current';
}

export function buildCollectionRows(orders, customers, nowValue) {
    var customerIndex = buildCustomerIndex(customers);
    var allowedStatuses = ['confirmed', 'fulfilled', 'fullfilled'];
    var sourceOrders = Array.isArray(orders) ? orders : [];
    var rows = [];
    var orderIndex = 0;

    while (orderIndex < sourceOrders.length) {
        var order = sourceOrders[orderIndex] || {};
        var status = String(order.status || '').toLowerCase();
        var amount = getOutstandingAmount(order);
        if (allowedStatuses.indexOf(status) !== -1 && amount > 0 && order.archived !== true) {
            var customer = customerIndex[normalizeName(order.customerName)] || {};
            var dueOffsetDays = getDueOffsetDays(order, nowValue);
            var ageDays = Math.max(0, dueOffsetDays);
            rows.push({
                id: order.id || '',
                customerId: customer.id || '',
                customerName: order.customerName || getCustomerName(customer) || 'Unknown customer',
                phone: customer.phone || order.customerPhone || '',
                orderDate: order.orderDate || order.createdAt || '',
                dueDate: order.dueDate || order.orderDate || order.createdAt || '',
                status: status,
                amount: amount,
                ageDays: ageDays,
                dueInDays: Math.max(0, 0 - dueOffsetDays),
                risk: getCollectionRisk(ageDays)
            });
        }
        orderIndex = orderIndex + 1;
    }

    rows.sort(function(a, b) {
        if (a.ageDays !== b.ageDays) {
            return b.ageDays - a.ageDays;
        }
        return b.amount - a.amount;
    });
    return rows;
}

export function summarizeCollections(rows) {
    var sourceRows = Array.isArray(rows) ? rows : [];
    var summary = {
        outstanding: 0,
        overdue: 0,
        critical: 0,
        customers: 0
    };
    var customerNames = {};
    var index = 0;

    while (index < sourceRows.length) {
        var row = sourceRows[index];
        summary.outstanding = summary.outstanding + Number(row.amount || 0);
        if (row.ageDays > 0) {
            summary.overdue = summary.overdue + Number(row.amount || 0);
        }
        if (row.risk === 'critical') {
            summary.critical = summary.critical + 1;
        }
        customerNames[normalizeName(row.customerName)] = true;
        index = index + 1;
    }

    summary.customers = Object.keys(customerNames).filter(function(key) {
        return key !== '';
    }).length;
    return summary;
}

function flattenInventory(categories) {
    var index = {};
    var sourceCategories = Array.isArray(categories) ? categories : [];
    var categoryIndex = 0;

    while (categoryIndex < sourceCategories.length) {
        var category = sourceCategories[categoryIndex] || {};
        var products = Array.isArray(category.products) ? category.products : [];
        var productIndex = 0;
        while (productIndex < products.length) {
            var product = products[productIndex] || {};
            var key = product.id || normalizeName(product.displayName || product.name);
            if (key) {
                index[key] = product;
            }
            productIndex = productIndex + 1;
        }
        categoryIndex = categoryIndex + 1;
    }

    return index;
}

export function buildProductionPlan(orders, inventoryCategories, dateKey) {
    var inventoryIndex = flattenInventory(inventoryCategories);
    var sourceOrders = Array.isArray(orders) ? orders : [];
    var demandByProduct = {};
    var allowedStatuses = ['pending', 'confirmed'];
    var orderCount = 0;
    var orderIndex = 0;

    while (orderIndex < sourceOrders.length) {
        var order = sourceOrders[orderIndex] || {};
        var orderDateKey = getLocalDateKey(order.orderDate || order.dueDate || order.createdAt);
        var status = String(order.status || '').toLowerCase();
        if (orderDateKey === dateKey && allowedStatuses.indexOf(status) !== -1 && order.archived !== true) {
            orderCount = orderCount + 1;
            var items = Array.isArray(order.items) ? order.items : [];
            var itemIndex = 0;
            while (itemIndex < items.length) {
                var item = items[itemIndex] || {};
                var key = item.productId || normalizeName(item.name || item.productName);
                if (key) {
                    if (!demandByProduct[key]) {
                        demandByProduct[key] = {
                            productId: item.productId || '',
                            name: item.name || item.productName || 'Product',
                            demand: 0,
                            orders: 0
                        };
                    }
                    demandByProduct[key].demand = demandByProduct[key].demand + Number(item.quantity || 0);
                    demandByProduct[key].orders = demandByProduct[key].orders + 1;
                }
                itemIndex = itemIndex + 1;
            }
        }
        orderIndex = orderIndex + 1;
    }

    var rows = Object.keys(demandByProduct).map(function(key) {
        var demandRow = demandByProduct[key];
        var inventory = inventoryIndex[key] || {};
        if (!inventory.id && demandRow.productId) {
            inventory = inventoryIndex[demandRow.productId] || {};
        }
        var available = Number(inventory.left || 0);
        if (inventory.reservesSavedOrders === true && inventory.inventoryDate === dateKey) {
            // The selected orders are already deducted from Left; restore their allocation before planning.
            available += demandRow.demand;
        }
        var required = Math.max(0, demandRow.demand - available);
        return {
            productId: demandRow.productId,
            name: inventory.displayName || inventory.name || demandRow.name,
            demand: demandRow.demand,
            available: available,
            required: required,
            surplus: Math.max(0, available - demandRow.demand),
            orders: demandRow.orders,
            status: required > 0 ? 'shortage' : 'ready'
        };
    });

    rows.sort(function(a, b) {
        if (a.required !== b.required) {
            return b.required - a.required;
        }
        return a.name.localeCompare(b.name);
    });

    return {
        dateKey: dateKey,
        orderCount: orderCount,
        rows: rows,
        unitsDemanded: rows.reduce(function(sum, row) {
            return sum + row.demand;
        }, 0),
        unitsToProduce: rows.reduce(function(sum, row) {
            return sum + row.required;
        }, 0),
        shortages: rows.filter(function(row) {
            return row.required > 0;
        }).length
    };
}

export function buildDeliveryRows(orders, customers, dateKey) {
    var customerIndex = buildCustomerIndex(customers);
    var sourceOrders = Array.isArray(orders) ? orders : [];
    var allowedStatuses = ['confirmed', 'fulfilled', 'fullfilled', 'paid'];
    var rows = [];
    var orderIndex = 0;

    while (orderIndex < sourceOrders.length) {
        var order = sourceOrders[orderIndex] || {};
        var status = String(order.status || '').toLowerCase();
        var orderDateKey = getLocalDateKey(order.orderDate || order.dueDate || order.createdAt);
        if (orderDateKey === dateKey && allowedStatuses.indexOf(status) !== -1 && order.archived !== true) {
            var customer = customerIndex[normalizeName(order.customerName)] || {};
            var items = Array.isArray(order.items) ? order.items : [];
            rows.push({
                id: order.id || '',
                customerId: customer.id || '',
                customerName: order.customerName || getCustomerName(customer) || 'Unknown customer',
                phone: customer.phone || order.customerPhone || '',
                address: customer.address || order.deliveryAddress || 'Address not saved',
                status: status,
                totalAmount: Number(order.totalAmount || 0),
                itemLines: items.length,
                unitCount: items.reduce(function(sum, item) {
                    return sum + Number(item.quantity || 0);
                }, 0),
                items: items,
                delivered: status === 'fulfilled' || status === 'fullfilled' || status === 'paid'
            });
        }
        orderIndex = orderIndex + 1;
    }

    rows.sort(function(a, b) {
        if (a.delivered !== b.delivered) {
            return a.delivered ? 1 : -1;
        }
        return a.customerName.localeCompare(b.customerName);
    });
    return rows;
}

export function summarizeDeliveries(rows) {
    var sourceRows = Array.isArray(rows) ? rows : [];
    return {
        stops: sourceRows.length,
        ready: sourceRows.filter(function(row) {
            return !row.delivered;
        }).length,
        delivered: sourceRows.filter(function(row) {
            return row.delivered;
        }).length,
        units: sourceRows.reduce(function(sum, row) {
            return sum + Number(row.unitCount || 0);
        }, 0)
    };
}
