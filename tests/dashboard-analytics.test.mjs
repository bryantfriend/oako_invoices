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
    assert.match(dashboardView, /const\s+getAnalyticsOrders\s*=\s*\(\)\s*=>\s*showArchivedAnalytics\s*\?\s*allOrders\s*:\s*getActiveOrders\(allOrders\);/);
    assert.match(dashboardView, /dashboardController\.loadStats\(analyticsOrders,\s*currentPeriod,\s*revenueGranularity,\s*analyticsReturnInvoices,\s*analyticsReturnOrders\)/);
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

    const paidIndex = stats.charts.statusPipeline.labels.indexOf('Paid');

    assert.equal(stats.metrics.orders.value, 1);
    assert.equal(stats.metrics.revenue.value, 250);
    assert.equal(stats.metrics.aov.value, 250);
    assert.equal(stats.charts.statusPipeline.data[paidIndex], 1);
});

test('order archiving preserves previousStatus for future analytics', function() {
    const orderService = readText('js/services/orderService.js');

    assert.match(orderService, /const\s+previousStatus\s*=\s*existingOrder/);
    assert.match(orderService, /previousStatus:\s*previousStatus/);
});