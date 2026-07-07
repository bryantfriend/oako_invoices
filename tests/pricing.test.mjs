import test from 'node:test';
import assert from 'node:assert/strict';
import {
    applyPriceOverrideToItem,
    buildPricedOrderItemFromProduct,
    calculateOrderTotals,
    clearPriceOverrideFromItem,
    getProductPriceByMode,
    normalizeOrderItemPricing,
    repriceOrderItem
} from '../js/core/pricing.js';

test('product price resolver maps legacy retail price and explicit business price', function() {
    const product = { id: 'bread', price: 120, businessPrice: 95 };
    assert.equal(getProductPriceByMode(product, 'retail'), 120);
    assert.equal(getProductPriceByMode(product, 'business'), 95);
});

test('business mode does not silently fall back to retail price', function() {
    assert.throws(function() {
        getProductPriceByMode({ id: 'bread', price: 120 }, 'business');
    }, /Business Price/);
});

test('product price resolver accepts existing snake_case business price fields', function() {
    const product = { id: 'bread', price: 120, business_price: 95 };
    assert.equal(getProductPriceByMode(product, 'retail'), 120);
    assert.equal(getProductPriceByMode(product, 'business'), 95);
});

test('product price resolver accepts nested pricing maps', function() {
    const product = { id: 'bread', prices: { retail: 120, business: 95 } };
    assert.equal(getProductPriceByMode(product, 'retail'), 120);
    assert.equal(getProductPriceByMode(product, 'business'), 95);
});

test('product price resolver accepts spreadsheet-style price headers', function() {
    assert.equal(getProductPriceByMode({ id: 'bread', price: 120, 'Business Price': 95 }, 'business'), 95);
    assert.equal(getProductPriceByMode({ id: 'bread', price: 120, 'Price Business': '95 сом' }, 'business'), 95);
    assert.equal(getProductPriceByMode({ id: 'bread', price: 120, 'Business Price (KGS)': '95' }, 'business'), 95);
    assert.equal(getProductPriceByMode({ id: 'bread', price: 120, businessPriceSom: '95' }, 'business'), 95);
    assert.equal(getProductPriceByMode({ id: 'bread', 'Retail Price': '1,200', 'Business Price': '950' }, 'retail'), 1200);
    assert.throws(function() {
        getProductPriceByMode({ id: 'bread', price: 120, 'Business Price': 'сом' }, 'business');
    }, /Business Price/);
});

test('order item snapshots price metadata and recalculates non-overridden mode switches', function() {
    const item = buildPricedOrderItemFromProduct({ id: 'bread', displayName: 'Bread', retailPrice: 120, businessPrice: 95 }, 'retail', 2);
    assert.equal(item.priceMode, 'retail');
    assert.equal(item.unitPrice, 120);
    assert.equal(item.originalRetailPrice, 120);
    assert.equal(item.originalBusinessPrice, 95);
    assert.equal(item.lineSubtotal, 240);

    const repriced = repriceOrderItem(item, 'business');
    assert.equal(repriced.priceMode, 'business');
    assert.equal(repriced.unitPrice, 95);
    assert.equal(repriced.lineSubtotal, 190);
});

test('manual override survives mode switch and can be cleared to base mode', function() {
    const item = buildPricedOrderItemFromProduct({ id: 'bread', displayName: 'Bread', retailPrice: 120, businessPrice: 95 }, 'retail', 2);
    const overridden = applyPriceOverrideToItem(item, 88, 'customer agreement', 'admin-1', '2026-07-04T00:00:00.000Z');
    const switched = repriceOrderItem(overridden, 'business');
    assert.equal(switched.priceMode, 'override');
    assert.equal(switched.selectedBasePriceMode, 'business');
    assert.equal(switched.unitPrice, 88);

    const cleared = clearPriceOverrideFromItem(switched);
    assert.equal(cleared.priceOverridden, false);
    assert.equal(cleared.priceMode, 'business');
    assert.equal(cleared.unitPrice, 95);
});

test('totals use unitPrice and old price-only items remain compatible', function() {
    const oldItem = normalizeOrderItemPricing({ productId: 'legacy', price: 10, quantity: 3 });
    const newItem = normalizeOrderItemPricing({ productId: 'new', unitPrice: 5, quantity: 2, priceMode: 'business' });
    assert.equal(oldItem.unitPrice, 10);
    assert.deepEqual(calculateOrderTotals([oldItem, newItem]), { subtotal: 40, totalAmount: 40 });
});
