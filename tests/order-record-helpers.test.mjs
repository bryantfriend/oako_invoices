import test from 'node:test';
import assert from 'node:assert/strict';
import {
    filterRecordsByArchivedMode,
    getAnalyticsStatus,
    getRecordActivityTimestamp,
    isArchivedRecord,
    shouldIncludeRecordInAnalytics
} from '../js/core/orderRecordHelpers.js';

test('archived record helpers preserve previous status for analytics', function() {
    var archived = { id: 'a1', archived: true, status: 'archived', previousStatus: 'fulfilled' };
    assert.equal(isArchivedRecord(archived), true);
    assert.equal(getAnalyticsStatus(archived), 'fulfilled');
    assert.equal(shouldIncludeRecordInAnalytics(archived, { includeArchived: true }), true);
    assert.equal(shouldIncludeRecordInAnalytics(archived, { includeArchived: false }), false);
});

test('archived mode filter supports active, archived, and all recent order views', function() {
    var records = [
        { id: 'active', status: 'confirmed' },
        { id: 'archived-flag', archived: true, status: 'paid' },
        { id: 'archived-status', status: 'archived', previousStatus: 'paid' }
    ];
    assert.deepEqual(filterRecordsByArchivedMode(records, 'active').map(function(record) { return record.id; }), ['active']);
    assert.deepEqual(filterRecordsByArchivedMode(records, 'archived').map(function(record) { return record.id; }), ['archived-flag', 'archived-status']);
    assert.deepEqual(filterRecordsByArchivedMode(records, 'all').map(function(record) { return record.id; }), ['active', 'archived-flag', 'archived-status']);
});

test('record activity timestamp includes archive time for recent archived orders', function() {
    var timestamp = getRecordActivityTimestamp({ createdAt: '2026-01-01T00:00:00.000Z', archivedAt: '2026-07-01T00:00:00.000Z' });
    assert.equal(timestamp, new Date('2026-07-01T00:00:00.000Z').getTime());
});