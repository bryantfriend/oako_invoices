import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { statsService } from '../js/services/statsService.js';

function readText(path) {
    return fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
}

test('dashboard analytics can include archived data by default and hide it on demand', function() {
    const dashboardView = readText('js/views/dashboardView.js');

    assert.match(dashboardView, /let\s+showArchivedAnalytics\s*=\s*true;/);
    assert.match(dashboardView, /id="show-archived-analytics"\s+\$\{showArchivedAnalytics\s*\?\s*'checked'/);
    assert.match(dashboardView, /Analytics: active \+ archived/);
    assert.match(dashboardView, /const\s+getAnalyticsOrders\s*=\s*\(\)\s*=>\s*allOrders\.filter\(order\s*=>\s*shouldIncludeRecordInAnalytics\(order,\s*\{\s*includeArchived:\s*showArchivedAnalytics\s*\}\)\)/);
    assert.match(dashboardView, /dashboardController\.loadStats\(analyticsOrders,\s*currentPeriod,\s*revenueGranularity,\s*analyticsReturnInvoices,\s*analyticsReturnOrders,\s*intelligenceSettings\)/);
    assert.match(dashboardView, /showArchivedAnalytics\s*=\s*event\.target\.checked;/);
});

test('archived orders retain previous status for included analytics', function() {
    const today = new Date().toISOString();
    const stats = statsService.getDashboardStats([
        {
            id: 'archived-paid-order',
            archived: true,
            status: 'archived',
            previousStatus: 'paid',
            orderDate: today,
            totalAmount: 250,
            items: [{ name: 'Dried Apricot', quantity: 2, price: 125 }]
        }
    ], '30d');

    const archivedIndex = stats.charts.statusPipeline.labels.indexOf('Archived');

    assert.equal(stats.metrics.orders.value, 1);
    assert.equal(stats.metrics.revenue.value, 250);
    assert.equal(stats.metrics.aov.value, 250);
    assert.equal(stats.charts.statusPipeline.data[archivedIndex], 1);
});

test('order archiving preserves previousStatus for future analytics', function() {
    const orderService = readText('js/services/orderService.js');

    assert.match(orderService, /const\s+previousStatus\s*=\s*existingOrder/);
    assert.match(orderService, /previousStatus:\s*previousStatus/);
    assert.match(orderService, /LEGACY_ARCHIVE_COLLECTION\s*=\s*'orders_archive'/);
    assert.match(orderService, /mergeLegacyArchivedOrders/);
});

test('all analytics includes confirmed revenue older than the former 30-day bucket cap', function() {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 120);
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 2);
    const stats = statsService.getDashboardStats([
        { id: 'old-confirmed', status: 'confirmed', orderDate: oldDate.toISOString(), totalAmount: 300, items: [] },
        { id: 'recent-paid', status: 'paid', orderDate: recentDate.toISOString(), totalAmount: 100, items: [] }
    ], 'all', 'day');

    assert.equal(stats.metrics.revenue.value, 400);
    assert.equal(stats.charts.revenueOverTime.confirmedRevenue.reduce(function(sum, amount) {
        return sum + amount;
    }, 0), 400);
    assert.ok(stats.charts.revenueOverTime.labels.length > 100);
});

test('three, six, and twelve month analytics use their selected calendar windows', function() {
    function dateDaysAgo(days) {
        const date = new Date();
        date.setDate(date.getDate() - days);
        return date.toISOString();
    }
    const orders = [
        { id: '80-days', status: 'confirmed', orderDate: dateDaysAgo(80), totalAmount: 80, items: [] },
        { id: '150-days', status: 'confirmed', orderDate: dateDaysAgo(150), totalAmount: 150, items: [] },
        { id: '300-days', status: 'paid', orderDate: dateDaysAgo(300), totalAmount: 300, items: [] },
        { id: '400-days', status: 'confirmed', orderDate: dateDaysAgo(400), totalAmount: 400, items: [] }
    ];

    assert.equal(statsService.getDashboardStats(orders, '90d').metrics.revenue.value, 80);
    assert.equal(statsService.getDashboardStats(orders, '180d').metrics.revenue.value, 230);
    assert.equal(statsService.getDashboardStats(orders, '365d').metrics.revenue.value, 530);
    assert.equal(statsService.getDashboardStats(orders, 'all').metrics.revenue.value, 930);
});

test('custom analytics end date includes the complete selected day', function() {
    const date = new Date();
    const dateKey = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
    const lateToday = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 22, 30, 0);
    const stats = statsService.getDashboardStats([
        { id: 'late-order', status: 'confirmed', orderDate: lateToday.toISOString(), totalAmount: 75, items: [] }
    ], { start: dateKey, end: dateKey }, 'day');

    assert.equal(stats.metrics.revenue.value, 75);
    assert.equal(stats.charts.revenueOverTime.confirmedRevenue[0], 75);
});

test('dashboard exposes every range and routes range changes through a six-stage ICF Intent', function() {
    const dashboardView = readText('js/views/dashboardView.js');
    const intent = readText('js/ICF/Intents/SelectDashboardAnalyticsRangeIntent.js');

    ['today', '7d', '30d', '90d', '180d', '365d', 'all'].forEach(function(period) {
        assert.match(dashboardView, new RegExp("value: '" + period + "'"));
    });
    assert.match(dashboardView, /selectDashboardAnalyticsRangeIntentModule.createSelectDashboardAnalyticsRangeIntent/);
    ['Validate', 'Normalize', 'AddContext', 'Authorize', 'Process', 'Emit'].forEach(function(stageName) {
        assert.match(intent, new RegExp(stageName + ': \{'));
    });
});


test('day week and month groupings cover the same selected historical revenue', function() {
    function dateDaysAgo(days) {
        const date = new Date();
        date.setDate(date.getDate() - days);
        return date.toISOString();
    }
    const orders = [
        { id: 'recent-group', status: 'confirmed', orderDate: dateDaysAgo(3), totalAmount: 20, items: [{ quantity: 2 }] },
        { id: 'historic-group', status: 'paid', orderDate: dateDaysAgo(75), totalAmount: 30, items: [{ quantity: 3 }] }
    ];
    const daily = statsService.getDashboardStats(orders, 'all', 'day').charts;
    const weekly = statsService.getDashboardStats(orders, 'all', 'week').charts;
    const monthly = statsService.getDashboardStats(orders, 'all', 'month').charts;

    [daily, weekly, monthly].forEach(function(charts) {
        assert.equal(charts.revenueOverTime.confirmedRevenue.reduce(function(sum, amount) { return sum + amount; }, 0), 50);
        assert.equal(charts.unitDemandOverTime.data.reduce(function(sum, units) { return sum + units; }, 0), 5);
        assert.equal(charts.revenueOverTime.labels.length, charts.unitDemandOverTime.labels.length);
    });
    assert.ok(daily.revenueOverTime.labels.length > weekly.revenueOverTime.labels.length);
    assert.ok(weekly.revenueOverTime.labels.length > monthly.revenueOverTime.labels.length);
});

test('confirmed revenue normalizes amounts, deducts returns, and explains excluded states', function() {
    const orders = [
        { id: 'confirmed', status: 'confirmed', orderDate: '2026-08-10', totalAmount: 100, items: [] },
        { id: 'fulfilled-string', status: 'fulfilled', orderDate: '2026-08-10', totalAmount: '200', items: [] },
        { id: 'paid', status: 'paid', orderDate: '2026-08-10', totalAmount: 300, items: [] },
        { id: 'draft', status: 'draft', orderDate: '2026-08-10', totalAmount: 400, items: [] },
        { id: 'pending', status: 'pending', orderDate: '2026-08-10', totalAmount: 500, items: [] },
        { id: 'cancelled', status: 'cancelled', orderDate: '2026-08-10', totalAmount: 600, items: [] },
        { id: 'archived-paid', status: 'archived', archived: true, previousStatus: 'paid', orderDate: '2026-08-10', totalAmount: 700, items: [] },
        { id: 'archived-flag-paid', status: 'paid', archived: true, orderDate: '2026-08-10', totalAmount: 50, items: [] },
        { id: 'archived-unknown', status: 'archived', archived: true, orderDate: '2026-08-10', totalAmount: 800, items: [] },
        {
            id: 'partial-return',
            status: 'paid',
            orderDate: '2026-08-10',
            totalAmount: 100,
            returnSummary: { totalReturnedAmount: 30 },
            items: [{ quantity: 2, returnedQuantity: 1, price: 30 }]
        },
        {
            id: 'full-return',
            status: 'returned',
            orderDate: '2026-08-10',
            totalAmount: 90,
            items: [{ quantity: 1, returnedQuantity: 1, price: 90 }]
        }
    ];
    const stats = statsService.getDashboardStats(orders, { start: '2026-08-10', end: '2026-08-10' }, 'day');

    assert.equal(stats.metrics.orders.value, 11);
    assert.equal(stats.metrics.revenue.value, 1420);
    assert.equal(stats.metrics.aov.value, 1420 / 7);
    assert.equal(stats.charts.revenueOverTime.confirmedRevenue[0], 1420);
    assert.equal(stats.revenueReconciliation.includedOrderCount, 7);
    assert.equal(stats.revenueReconciliation.archivedIncludedCount, 2);
    assert.equal(stats.revenueReconciliation.returnedAmount, 120);
    assert.equal(stats.revenueReconciliation.exclusionCounts.draft, 1);
    assert.equal(stats.revenueReconciliation.exclusionCounts.pending, 1);
    assert.equal(stats.revenueReconciliation.exclusionCounts.cancelled, 1);
    assert.equal(stats.revenueReconciliation.exclusionCounts.unknown_status, 1);
});

test('confirmed revenue stays on the original order date after fulfillment and payment', function() {
    const stats = statsService.getDashboardStats([
        {
            id: 'paid-later',
            status: 'paid',
            orderDate: '2026-08-10T12:00:00+06:00',
            fulfilledAt: '2026-08-11T12:00:00+06:00',
            paidAt: '2026-08-12T12:00:00+06:00',
            totalAmount: 250,
            items: []
        }
    ], { start: '2026-08-10', end: '2026-08-12' }, 'day');

    assert.deepEqual(stats.charts.revenueOverTime.labels, ['8/10', '8/11', '8/12']);
    assert.deepEqual(stats.charts.revenueOverTime.confirmedRevenue, [250, 0, 0]);
});
