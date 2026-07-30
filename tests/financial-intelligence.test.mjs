import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    buildFinancialIntelligence,
    calculateProfitScenario
} from '../js/services/financialIntelligenceService.js';

function confirmedOrder(overrides) {
    return Object.assign({
        id: 'order-1',
        status: 'confirmed',
        customerName: 'Green Market',
        totalAmount: 200,
        orderDate: '2026-07-20T08:00:00.000Z',
        items: [{ quantity: 2, unitPrice: 100, unitCost: 40 }]
    }, overrides || {});
}

function buildIntelligence(options) {
    var source = options || {};
    var currentOrders = source.currentOrders || [];
    return buildFinancialIntelligence({
        currentOrders: currentOrders,
        previousOrders: source.previousOrders || [],
        allOrders: source.allOrders || currentOrders,
        currentMetrics: source.currentMetrics || {
            revenue: currentOrders.reduce(function(sum, order) { return sum + Number(order.totalAmount || 0); }, 0),
            outstanding: 0
        },
        previousMetrics: source.previousMetrics || { revenue: 0, outstanding: 0 },
        returnedAmount: source.returnedAmount || 0,
        settings: source.settings || {},
        now: source.now || new Date('2026-07-30T12:00:00.000Z')
    });
}

test('profitability uses actual unit costs and exposes a complete gross margin', function() {
    var result = buildIntelligence({ currentOrders: [confirmedOrder()] });

    assert.equal(result.profitability.complete, true);
    assert.equal(result.profitability.costBasis, 'actual');
    assert.equal(result.profitability.costOfGoods, 80);
    assert.equal(result.profitability.grossProfit, 120);
    assert.equal(result.profitability.marginPercent, 60);
    assert.equal(result.profitability.coveragePercent, 100);
    assert.equal(result.productMargins[0].productName, 'Product');
    assert.equal(result.productMargins[0].grossProfit, 120);
    assert.equal(result.productMargins[0].marginPercent, 60);
});

test('fallback COGS fills missing product costs without pretending it is actual cost', function() {
    var order = confirmedOrder({
        items: [{ quantity: 2, unitPrice: 100 }]
    });
    var result = buildIntelligence({
        currentOrders: [order],
        settings: { defaultCostPercent: 50 }
    });

    assert.equal(result.profitability.complete, true);
    assert.equal(result.profitability.costBasis, 'fallback');
    assert.equal(result.profitability.costOfGoods, 100);
    assert.equal(result.profitability.estimatedCostUnits, 2);
    assert.equal(result.profitability.actualCostUnits, 0);
});

test('profit stays incomplete when cost coverage is missing', function() {
    var order = confirmedOrder({
        items: [{ quantity: 2, unitPrice: 100 }]
    });
    var result = buildIntelligence({ currentOrders: [order] });

    assert.equal(result.profitability.complete, false);
    assert.equal(result.profitability.coveragePercent, 0);
    assert.equal(result.profitability.missingCostUnits, 2);
    assert.match(result.insights.map(function(insight) { return insight.text; }).join(' '), /Profit remains hidden/);
});

test('customer reliability, forecast, and collection risk use payment history and aging', function() {
    var paid = confirmedOrder({
        id: 'paid',
        status: 'paid',
        totalAmount: 300,
        paidAt: '2026-07-25T08:00:00.000Z',
        items: [{ quantity: 3, unitPrice: 100, unitCost: 40 }]
    });
    var overdue = confirmedOrder({
        id: 'overdue',
        customerName: 'Slow Buyer',
        totalAmount: 500,
        agingDays: 35,
        items: [{ quantity: 5, unitPrice: 100, unitCost: 40 }]
    });
    var result = buildIntelligence({
        currentOrders: [paid, overdue],
        currentMetrics: { revenue: 800, outstanding: 500 }
    });

    assert.equal(result.cashFlowForecast.historicalRunRate, 300);
    assert.equal(result.cashFlowForecast.weightedOutstanding, 100);
    assert.equal(result.cashFlowForecast.expectedCash, 400);
    assert.equal(result.cashFlowForecast.confidence, 'medium');
    assert.equal(result.risks[0].customerName, 'Slow Buyer');
    assert.equal(result.risks[0].riskLevel, 'high');
    assert.equal(result.customerValue[0].customerName, 'Slow Buyer');
    assert.equal(result.customerValue[0].reliabilityLabel, 'At risk');
});

test('customer value uses full available history while period insights remain period-scoped', function() {
    var current = confirmedOrder({ id: 'current', totalAmount: 200 });
    var historic = confirmedOrder({
        id: 'historic',
        status: 'paid',
        totalAmount: 300,
        orderDate: '2025-01-10T08:00:00.000Z'
    });
    var result = buildIntelligence({
        currentOrders: [current],
        allOrders: [current, historic]
    });

    assert.equal(result.customerValue[0].totalValue, 500);
    assert.equal(result.customerValue[0].orderCount, 2);
});

test('scenario planning models independent price and cost changes', function() {
    var scenario = calculateProfitScenario({
        netRevenue: 200,
        costOfGoods: 80
    }, 10, 25);

    assert.deepEqual(scenario, {
        revenue: 220,
        costOfGoods: 100,
        grossProfit: 120,
        marginPercent: 54.55
    });
});

test('feature wiring preserves cost settings, snapshots, and dashboard controls', function() {
    var settingsService = fs.readFileSync(new URL('../js/services/settingsService.js', import.meta.url), 'utf8');
    var settingsView = fs.readFileSync(new URL('../js/views/settingsView.js', import.meta.url), 'utf8');
    var pricing = fs.readFileSync(new URL('../js/core/pricing.js', import.meta.url), 'utf8');
    var dashboard = fs.readFileSync(new URL('../js/views/dashboardView.js', import.meta.url), 'utf8');
    var stats = fs.readFileSync(new URL('../js/services/statsService.js', import.meta.url), 'utf8');

    assert.match(settingsService, /defaultCostPercent:\s*0/);
    assert.match(settingsView, /name="defaultCostPercent"/);
    assert.match(pricing, /unitCost:\s*getProductUnitCostSnapshot\(source\)/);
    assert.match(dashboard, /renderFinancialIntelligencePanel\(stats\.intelligence\)/);
    assert.match(dashboard, /intelligenceSettings\)/);
    assert.match(stats, /buildFinancialIntelligence\(\{/);
});
