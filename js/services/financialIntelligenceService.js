import { getAnalyticsStatus, getMillis } from "../core/orderRecordHelpers.js";

const CONFIRMED_STATUSES = ['confirmed', 'fulfilled', 'fullfilled', 'paid'];
const OUTSTANDING_STATUSES = ['confirmed', 'fulfilled', 'fullfilled'];
const COST_FIELD_NAMES = [
    'unitCost',
    'costPrice',
    'productionCost',
    'unitProductionCost',
    'productUnitCost'
];

function safeNumber(value, fallback) {
    var number = Number(value);
    if (Number.isFinite(number)) {
        return number;
    }
    return Number(fallback) || 0;
}

function roundMoney(value) {
    return Math.round((safeNumber(value, 0) + Number.EPSILON) * 100) / 100;
}

function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
}

function getOrderAmount(order) {
    return Math.max(0, safeNumber(order && order.totalAmount, 0));
}

function getOrderDateMillis(order) {
    var source = order || {};
    return getMillis(source.orderDate) || getMillis(source.createdAt) || getMillis(source.updatedAt);
}

function getPaidDateMillis(order) {
    var source = order || {};
    return getMillis(source.paidAt) || getMillis(source.fulfilledAt) || getOrderDateMillis(source);
}

function getItemQuantity(item) {
    var source = item || {};
    if (source.adjustedQuantity !== undefined) {
        return Math.max(0, safeNumber(source.adjustedQuantity, 0));
    }
    var orderedQuantity = Math.max(0, safeNumber(source.quantity, 0));
    var returnedQuantity = Math.max(0, safeNumber(
        source.returnedQuantity !== undefined ? source.returnedQuantity : source.returnQuantity,
        0
    ));
    return Math.max(0, orderedQuantity - returnedQuantity);
}

function getItemUnitPrice(item) {
    var source = item || {};
    if (source.unitPrice !== undefined) {
        return Math.max(0, safeNumber(source.unitPrice, 0));
    }
    return Math.max(0, safeNumber(source.price, 0));
}

function findExplicitUnitCost(item) {
    var source = item || {};
    for (var index = 0; index < COST_FIELD_NAMES.length; index += 1) {
        var fieldName = COST_FIELD_NAMES[index];
        if (source[fieldName] === undefined || source[fieldName] === null || source[fieldName] === '') {
            continue;
        }
        var cost = safeNumber(source[fieldName], -1);
        if (cost >= 0) {
            return cost;
        }
    }
    return null;
}

function getFallbackCostPercent(settings) {
    var percent = safeNumber(settings && settings.defaultCostPercent, 0);
    return clamp(percent, 0, 100);
}

function calculateProfitability(orders, revenue, returnedAmount, settings) {
    var fallbackCostPercent = getFallbackCostPercent(settings);
    var totalUnits = 0;
    var actualCostUnits = 0;
    var estimatedCostUnits = 0;
    var missingCostUnits = 0;
    var costOfGoods = 0;

    (orders || []).forEach(function(order) {
        if (CONFIRMED_STATUSES.indexOf(getAnalyticsStatus(order)) === -1) {
            return;
        }

        (Array.isArray(order.items) ? order.items : []).forEach(function(item) {
            var quantity = getItemQuantity(item);
            var unitPrice = getItemUnitPrice(item);
            var explicitCost = findExplicitUnitCost(item);
            totalUnits += quantity;

            if (explicitCost !== null) {
                actualCostUnits += quantity;
                costOfGoods += explicitCost * quantity;
                return;
            }
            if (fallbackCostPercent > 0) {
                estimatedCostUnits += quantity;
                costOfGoods += unitPrice * quantity * (fallbackCostPercent / 100);
                return;
            }
            missingCostUnits += quantity;
        });
    });

    var costedUnits = actualCostUnits + estimatedCostUnits;
    var coveragePercent = totalUnits > 0 ? (costedUnits / totalUnits) * 100 : 0;
    var netRevenue = Math.max(0, safeNumber(revenue, 0) - safeNumber(returnedAmount, 0));
    var grossProfit = netRevenue - costOfGoods;
    var complete = totalUnits > 0 && missingCostUnits === 0;
    var marginPercent = complete && netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0;
    var costBasis = 'missing';

    if (actualCostUnits > 0 && estimatedCostUnits > 0) {
        costBasis = 'blended';
    } else if (actualCostUnits > 0) {
        costBasis = 'actual';
    } else if (estimatedCostUnits > 0) {
        costBasis = 'fallback';
    }

    return {
        revenue: roundMoney(revenue),
        returnedAmount: roundMoney(returnedAmount),
        netRevenue: roundMoney(netRevenue),
        costOfGoods: roundMoney(costOfGoods),
        grossProfit: roundMoney(grossProfit),
        marginPercent: roundMoney(marginPercent),
        coveragePercent: roundMoney(coveragePercent),
        totalUnits: roundMoney(totalUnits),
        actualCostUnits: roundMoney(actualCostUnits),
        estimatedCostUnits: roundMoney(estimatedCostUnits),
        missingCostUnits: roundMoney(missingCostUnits),
        fallbackCostPercent: fallbackCostPercent,
        costBasis: costBasis,
        complete: complete
    };
}

function buildProductMargins(orders, settings) {
    var products = {};
    var fallbackCostPercent = getFallbackCostPercent(settings);

    (orders || []).forEach(function(order) {
        if (CONFIRMED_STATUSES.indexOf(getAnalyticsStatus(order)) === -1) return;

        (Array.isArray(order.items) ? order.items : []).forEach(function(item) {
            var quantity = getItemQuantity(item);
            if (quantity <= 0) return;
            var name = item.name || item.productName || item.name_en || 'Product';
            var key = String(item.productId || name).toLowerCase();
            var unitPrice = getItemUnitPrice(item);
            var explicitCost = findExplicitUnitCost(item);
            if (!products[key]) {
                products[key] = {
                    productId: item.productId || '',
                    productName: name,
                    units: 0,
                    revenue: 0,
                    costOfGoods: 0,
                    costedUnits: 0,
                    missingCostUnits: 0
                };
            }
            var product = products[key];
            product.units += quantity;
            product.revenue += unitPrice * quantity;
            if (explicitCost !== null) {
                product.costOfGoods += explicitCost * quantity;
                product.costedUnits += quantity;
            } else if (fallbackCostPercent > 0) {
                product.costOfGoods += unitPrice * quantity * (fallbackCostPercent / 100);
                product.costedUnits += quantity;
            } else {
                product.missingCostUnits += quantity;
            }
        });
    });

    return Object.keys(products).map(function(key) {
        var product = products[key];
        var complete = product.missingCostUnits === 0;
        var grossProfit = product.revenue - product.costOfGoods;
        return Object.assign({}, product, {
            units: roundMoney(product.units),
            revenue: roundMoney(product.revenue),
            costOfGoods: roundMoney(product.costOfGoods),
            grossProfit: roundMoney(grossProfit),
            marginPercent: complete && product.revenue > 0
                ? roundMoney((grossProfit / product.revenue) * 100)
                : 0,
            coveragePercent: product.units > 0
                ? roundMoney((product.costedUnits / product.units) * 100)
                : 0,
            complete: complete
        });
    }).sort(function(a, b) {
        return b.revenue - a.revenue;
    }).slice(0, 8);
}

function getCustomerKey(order) {
    return String(order && order.customerName ? order.customerName : 'Unknown customer').trim().toLowerCase();
}

function buildCustomerIntelligence(orders) {
    var customers = {};

    (orders || []).forEach(function(order) {
        var status = getAnalyticsStatus(order);
        if (CONFIRMED_STATUSES.indexOf(status) === -1) {
            return;
        }

        var key = getCustomerKey(order);
        var name = order.customerName || 'Unknown customer';
        var amount = getOrderAmount(order);
        var agingDays = Math.max(0, safeNumber(order.agingDays, 0));

        if (!customers[key]) {
            customers[key] = {
                customerName: name,
                orderCount: 0,
                totalValue: 0,
                paidValue: 0,
                outstandingValue: 0,
                overdueValue: 0,
                maximumAgingDays: 0
            };
        }

        var customer = customers[key];
        customer.orderCount += 1;
        customer.totalValue += amount;
        if (status === 'paid') {
            customer.paidValue += amount;
        } else if (OUTSTANDING_STATUSES.indexOf(status) !== -1) {
            customer.outstandingValue += amount;
            if (agingDays > 0) {
                customer.overdueValue += amount;
            }
            customer.maximumAgingDays = Math.max(customer.maximumAgingDays, agingDays);
        }
    });

    var rows = Object.keys(customers).map(function(key) {
        var customer = customers[key];
        var totalValue = Math.max(1, customer.totalValue);
        var overdueRatio = customer.overdueValue / totalValue;
        var currentOutstandingRatio = Math.max(0, customer.outstandingValue - customer.overdueValue) / totalValue;
        var agePenalty = customer.maximumAgingDays >= 30 ? 15 : (customer.maximumAgingDays >= 14 ? 8 : 0);
        var reliabilityScore = clamp(
            Math.round(100 - (overdueRatio * 70) - (currentOutstandingRatio * 15) - agePenalty),
            0,
            100
        );
        var reliabilityLabel = reliabilityScore >= 85
            ? 'Reliable'
            : (reliabilityScore >= 65 ? 'Watch' : 'At risk');

        return Object.assign({}, customer, {
            totalValue: roundMoney(customer.totalValue),
            paidValue: roundMoney(customer.paidValue),
            outstandingValue: roundMoney(customer.outstandingValue),
            overdueValue: roundMoney(customer.overdueValue),
            reliabilityScore: reliabilityScore,
            reliabilityLabel: reliabilityLabel
        });
    });

    return rows.sort(function(a, b) {
        if (b.totalValue !== a.totalValue) {
            return b.totalValue - a.totalValue;
        }
        return b.reliabilityScore - a.reliabilityScore;
    }).slice(0, 8);
}

function getCollectionWeight(agingDays) {
    if (agingDays <= 0) {
        return 0.9;
    }
    if (agingDays <= 7) {
        return 0.8;
    }
    if (agingDays <= 14) {
        return 0.65;
    }
    if (agingDays <= 30) {
        return 0.45;
    }
    return 0.2;
}

function buildCashFlowForecast(orders, now) {
    var currentDate = now instanceof Date ? now : new Date();
    var recentStart = currentDate.getTime() - (30 * 24 * 60 * 60 * 1000);
    var recentPaid = 0;
    var weightedOutstanding = 0;
    var outstandingTotal = 0;

    (orders || []).forEach(function(order) {
        var status = getAnalyticsStatus(order);
        var amount = getOrderAmount(order);
        if (status === 'paid' && getPaidDateMillis(order) >= recentStart) {
            recentPaid += amount;
        }
        if (OUTSTANDING_STATUSES.indexOf(status) !== -1) {
            var agingDays = Math.max(0, safeNumber(order.agingDays, 0));
            outstandingTotal += amount;
            weightedOutstanding += amount * getCollectionWeight(agingDays);
        }
    });

    var historicalRunRate = recentPaid;
    var expectedCash = historicalRunRate + weightedOutstanding;
    var weeklyRunRate = historicalRunRate / 4;
    var weights = [0.4, 0.3, 0.2, 0.1];
    var buckets = weights.map(function(weight, index) {
        return {
            label: 'Week ' + String(index + 1),
            expectedCash: roundMoney(weeklyRunRate + (weightedOutstanding * weight))
        };
    });
    var confidence = recentPaid > 0 && outstandingTotal > 0
        ? 'medium'
        : (recentPaid > 0 || outstandingTotal > 0 ? 'low' : 'insufficient');

    return {
        expectedCash: roundMoney(expectedCash),
        historicalRunRate: roundMoney(historicalRunRate),
        outstandingTotal: roundMoney(outstandingTotal),
        weightedOutstanding: roundMoney(weightedOutstanding),
        buckets: buckets,
        confidence: confidence,
        horizonDays: 30
    };
}

function buildRiskAlerts(orders) {
    var outstanding = (orders || []).filter(function(order) {
        return OUTSTANDING_STATUSES.indexOf(getAnalyticsStatus(order)) !== -1;
    });
    var maximumAmount = outstanding.reduce(function(maximum, order) {
        return Math.max(maximum, getOrderAmount(order));
    }, 0);

    return outstanding.map(function(order) {
        var agingDays = Math.max(0, safeNumber(order.agingDays, 0));
        var amount = getOrderAmount(order);
        var ageScore = clamp((agingDays / 30) * 70, 0, 70);
        var amountScore = maximumAmount > 0 ? (amount / maximumAmount) * 30 : 0;
        var riskScore = Math.round(ageScore + amountScore);
        var riskLevel = agingDays >= 30 || riskScore >= 75
            ? 'high'
            : (agingDays >= 14 || riskScore >= 45 ? 'medium' : 'low');

        return {
            orderId: order.id || '',
            customerName: order.customerName || 'Unknown customer',
            amount: roundMoney(amount),
            agingDays: agingDays,
            riskScore: riskScore,
            riskLevel: riskLevel
        };
    }).sort(function(a, b) {
        if (b.riskScore !== a.riskScore) {
            return b.riskScore - a.riskScore;
        }
        return b.amount - a.amount;
    }).slice(0, 8);
}

function describeChange(currentValue, previousValue, label, inverted) {
    var current = safeNumber(currentValue, 0);
    var previous = safeNumber(previousValue, 0);
    if (current === 0 && previous === 0) {
        return '';
    }
    if (previous === 0) {
        return {
            tone: inverted ? 'warning' : 'positive',
            text: label + ' started at ' + String(roundMoney(current)) + ' this period.'
        };
    }

    var percent = ((current - previous) / Math.abs(previous)) * 100;
    var direction = percent >= 0 ? 'increased' : 'decreased';
    var tone = inverted
        ? (percent > 0 ? 'warning' : 'positive')
        : (percent >= 0 ? 'positive' : 'warning');
    return {
        tone: tone,
        text: label + ' ' + direction + ' ' + String(Math.abs(roundMoney(percent))) + '% versus the prior period.'
    };
}

function buildChangeInsights(currentMetrics, previousMetrics, customers, profitability, previousProfitability) {
    var insights = [];
    var revenueInsight = describeChange(currentMetrics.revenue, previousMetrics.revenue, 'Revenue', false);
    var outstandingInsight = describeChange(currentMetrics.outstanding, previousMetrics.outstanding, 'Outstanding balance', true);

    if (revenueInsight) {
        insights.push(revenueInsight);
    }
    if (outstandingInsight) {
        insights.push(outstandingInsight);
    }
    if (profitability.complete && previousProfitability.complete) {
        var marginInsight = describeChange(
            profitability.marginPercent,
            previousProfitability.marginPercent,
            'Gross margin',
            false
        );
        if (marginInsight) {
            insights.push(marginInsight);
        }
    }
    if (customers.length > 0 && currentMetrics.revenue > 0) {
        var concentration = (customers[0].totalValue / currentMetrics.revenue) * 100;
        if (concentration >= 35) {
            insights.push({
                tone: 'warning',
                text: customers[0].customerName + ' represents ' + String(roundMoney(concentration)) + '% of period revenue.'
            });
        }
    }
    if (!profitability.complete && profitability.totalUnits > 0) {
        insights.push({
            tone: 'info',
            text: 'Profit remains hidden until product costs or a fallback COGS percentage cover all sold units.'
        });
    }
    return insights.slice(0, 5);
}

export function calculateProfitScenario(profitability, priceChangePercent, costChangePercent) {
    var source = profitability || {};
    var priceMultiplier = 1 + (safeNumber(priceChangePercent, 0) / 100);
    var costMultiplier = 1 + (safeNumber(costChangePercent, 0) / 100);
    var scenarioRevenue = Math.max(0, safeNumber(source.netRevenue, 0) * priceMultiplier);
    var scenarioCost = Math.max(0, safeNumber(source.costOfGoods, 0) * costMultiplier);
    var scenarioProfit = scenarioRevenue - scenarioCost;

    return {
        revenue: roundMoney(scenarioRevenue),
        costOfGoods: roundMoney(scenarioCost),
        grossProfit: roundMoney(scenarioProfit),
        marginPercent: scenarioRevenue > 0 ? roundMoney((scenarioProfit / scenarioRevenue) * 100) : 0
    };
}

export function buildFinancialIntelligence(options) {
    var safeOptions = options || {};
    var currentOrders = Array.isArray(safeOptions.currentOrders) ? safeOptions.currentOrders : [];
    var previousOrders = Array.isArray(safeOptions.previousOrders) ? safeOptions.previousOrders : [];
    var allOrders = Array.isArray(safeOptions.allOrders) ? safeOptions.allOrders : currentOrders;
    var currentMetrics = safeOptions.currentMetrics || {};
    var previousMetrics = safeOptions.previousMetrics || {};
    var settings = safeOptions.settings || {};
    var returnedAmount = safeNumber(safeOptions.returnedAmount, 0);
    var profitability = calculateProfitability(
        currentOrders,
        currentMetrics.revenue,
        returnedAmount,
        settings
    );
    var previousProfitability = calculateProfitability(
        previousOrders,
        previousMetrics.revenue,
        0,
        settings
    );
    var periodCustomers = buildCustomerIntelligence(currentOrders);
    var customers = buildCustomerIntelligence(allOrders);

    return {
        profitability: profitability,
        productMargins: buildProductMargins(currentOrders, settings),
        customerValue: customers,
        cashFlowForecast: buildCashFlowForecast(allOrders, safeOptions.now),
        risks: buildRiskAlerts(allOrders),
        insights: buildChangeInsights(
            currentMetrics,
            previousMetrics,
            periodCustomers,
            profitability,
            previousProfitability
        )
    };
}

export const financialIntelligenceService = {
    buildFinancialIntelligence: buildFinancialIntelligence,
    calculateProfitScenario: calculateProfitScenario
};
