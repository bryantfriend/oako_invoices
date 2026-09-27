import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBakeryProgress } from '../js/core/invoiceProductivity.js';
import { loadModule } from './helpers/load-isolated-module.mjs';

test('Orders bakery counts active orders across dates, deduplicates and excludes cancelled/archive records', function() {
    var order = { id: 'past', orderDate: '2025-01-01', isPrinted: true };
    var orders = [order, order, { id: 'future', orderDate: '2030-01-01' }, { id: 'undated' },
        { id: 'archive', archived: true }, { id: 'legacy', status: 'archived' },
        { id: 'cancelled', status: 'cancelled' }, { id: 'canceled', status: 'canceled' }];
    assert.deepEqual(buildBakeryProgress(orders), { total: 3, printed: 1, complete: false });
});

test('Daily bakery still uses its selected date and supports cached and Firestore timestamps', function() {
    var date = new Date(2026, 8, 27, 12);
    var orders = [
        { id: 'string', orderDate: '2026-09-27', isPrinted: true },
        { id: 'cached', orderDate: { seconds: date.getTime() / 1000 }, isPrinted: true },
        { id: 'firestore', orderDate: { toDate: function() { return date; } }, isPrinted: true },
        { id: 'other', orderDate: '2026-09-26' }
    ];
    assert.deepEqual(buildBakeryProgress(orders, '2026-09-27'), { total: 3, printed: 3, complete: true });
});

test('Orders bakery displays bread for older orders and daily empty state explains its date scope', async function() {
    var panel = await loadModule('js/components/invoiceProductivityPanel.js', {
        invoiceProductivity: { buildBakeryProgress, summarizeWorkflowEvents: function() { return {}; } },
        operationsPlanningService: { getLocalDateKey: function() { return '2026-09-27'; } },
        workflowLocalStore: { workflowLocalStore: {
            preference: function() { return { fun: true }; },
            read: function(name, key, fallback) { return fallback; }, list: function() { return []; }
        } }
    }, { document: { querySelector: function() { return null; } } });
    var mount = { innerHTML: '', closest: function() { return null; }, querySelectorAll: function() { return []; }, querySelector: function() { return {}; } };
    var orders = [{ id: 'older', orderDate: '2026-09-26' }];
    panel.mountInvoiceProductivityPanel(mount, orders);
    assert.match(mount.innerHTML, /All active orders/);
    assert.match(mount.innerHTML, /0 of 1 orders confirmed printed/);
    assert.match(mount.innerHTML, /class="bakery-loaf /);
    assert.doesNotMatch(mount.innerHTML, /Your first order/);
    panel.mountInvoiceProductivityPanel(mount, orders, '2026-09-27');
    assert.match(mount.innerHTML, /No active orders for 2026-09-27/);
    assert.doesNotMatch(mount.innerHTML, /class="bakery-loaf /);
});
