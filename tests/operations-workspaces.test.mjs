import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildCollectionRows,
    summarizeCollections,
    buildProductionPlan,
    buildDeliveryRows,
    summarizeDeliveries
} from '../js/services/operationsPlanningService.js';

test('collection queue prioritizes old outstanding orders and links customer contact data', function() {
    var orders = [
        { id: 'new', customerName: 'Fresh Cafe', status: 'confirmed', totalAmount: 1200, orderDate: '2026-08-01' },
        { id: 'old', customerName: 'Old Cafe', status: 'fulfilled', totalAmount: 5000, amountPaid: 1000, orderDate: '2026-07-10' },
        { id: 'paid', customerName: 'Paid Cafe', status: 'paid', totalAmount: 8000, orderDate: '2026-07-01' }
    ];
    var customers = [
        { id: 'customer-old', companyName: 'Old Cafe', phone: '+996 555 123 456' }
    ];
    var rows = buildCollectionRows(orders, customers, new Date('2026-08-01T12:00:00'));

    assert.equal(rows.length, 2);
    assert.equal(rows[0].id, 'old');
    assert.equal(rows[0].amount, 4000);
    assert.equal(rows[0].phone, '+996 555 123 456');
    assert.equal(rows[0].risk, 'critical');
    assert.deepEqual(summarizeCollections(rows), {
        outstanding: 5200,
        overdue: 4000,
        critical: 1,
        customers: 2
    });
});

test('production plan aggregates demand and subtracts current available inventory', function() {
    var orders = [
        {
            id: 'one',
            status: 'confirmed',
            orderDate: '2026-08-02',
            items: [
                { productId: 'bread', name: 'Bread', quantity: 8 },
                { productId: 'cake', name: 'Cake', quantity: 2 }
            ]
        },
        {
            id: 'two',
            status: 'pending',
            orderDate: '2026-08-02',
            items: [{ productId: 'bread', name: 'Bread', quantity: 4 }]
        },
        {
            id: 'other-day',
            status: 'confirmed',
            orderDate: '2026-08-03',
            items: [{ productId: 'bread', name: 'Bread', quantity: 99 }]
        }
    ];
    var inventory = [{
        id: 'bakery',
        products: [
            { id: 'bread', name: 'Bread', left: 5 },
            { id: 'cake', name: 'Cake', left: 3 }
        ]
    }];
    var plan = buildProductionPlan(orders, inventory, '2026-08-02');

    assert.equal(plan.orderCount, 2);
    assert.equal(plan.unitsDemanded, 14);
    assert.equal(plan.unitsToProduce, 7);
    assert.equal(plan.shortages, 1);
    assert.equal(plan.rows[0].productId, 'bread');
    assert.equal(plan.rows[0].demand, 12);
    assert.equal(plan.rows[0].required, 7);
    assert.equal(plan.rows[1].surplus, 1);
});

test('delivery run includes scheduled active deliveries and summarizes completion', function() {
    var orders = [
        { id: 'ready', customerName: 'Cafe A', status: 'confirmed', orderDate: '2026-08-01', totalAmount: 500, items: [{ name: 'Bread', quantity: 3 }] },
        { id: 'done', customerName: 'Cafe B', status: 'fulfilled', orderDate: '2026-08-01', totalAmount: 700, items: [{ name: 'Cake', quantity: 2 }] },
        { id: 'draft', customerName: 'Cafe C', status: 'draft', orderDate: '2026-08-01', items: [] }
    ];
    var customers = [
        { id: 'a', companyName: 'Cafe A', address: 'Main Street', phone: '111' },
        { id: 'b', companyName: 'Cafe B', address: 'West Street', phone: '222' }
    ];
    var rows = buildDeliveryRows(orders, customers, '2026-08-01');

    assert.equal(rows.length, 2);
    assert.equal(rows[0].id, 'ready');
    assert.equal(rows[0].address, 'Main Street');
    assert.equal(rows[1].delivered, true);
    assert.deepEqual(summarizeDeliveries(rows), {
        stops: 2,
        ready: 1,
        delivered: 1,
        units: 5
    });
});