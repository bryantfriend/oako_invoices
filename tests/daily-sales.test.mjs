import test from 'node:test';
import assert from 'node:assert/strict';
import { statsService } from '../js/services/statsService.js';

test('daily sales include confirmed and archived sales after returns without depending on product matches', function() {
    var orders = [
        { orderDate: '2026-09-13', status: 'confirmed', totalAmount: 100, items: [{ price: 10, returnedQuantity: 2, productMatchPending: true }] },
        { orderDate: '2026-09-13', status: 'paid', archived: true, totalAmount: 50 },
        { orderDate: '2026-09-13', status: 'draft', totalAmount: 900 },
        { orderDate: '2026-09-13', status: 'cancelled', totalAmount: 900 },
        { orderDate: '2026-09-12', status: 'confirmed', totalAmount: 900 },
        { orderDate: '2026-09-14', status: 'confirmed', totalAmount: 900 }
    ];
    assert.deepEqual(statsService.getDailySales(orders, new Date(2026, 8, 13, 0, 30)), { date: '2026-09-13', amount: 130, count: 2 });
});

test('daily sales use the local calendar date for timestamps and handle no sales', function() {
    var now = new Date(2026, 8, 13, 0, 30);
    var orders = [{ createdAt: new Date(2026, 8, 13, 0, 15).toISOString(), status: 'confirmed', totalAmount: '75' }];
    assert.equal(statsService.getDailySales(orders, now).amount, 75);
    assert.equal(statsService.getDailySales(orders, new Date(2026, 8, 14)).amount, 0);
});
