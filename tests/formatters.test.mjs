import test from 'node:test';
import assert from 'node:assert/strict';

import { formatDate } from '../js/core/formatters.js';

test('formatDate returns a placeholder for invalid cached dates', function() {
    assert.equal(formatDate('not-a-date'), '-');
    assert.equal(formatDate({}), '-');
    assert.equal(formatDate({ toDate: function() { return new Date('bad-date'); } }), '-');
});

test('formatDate formats valid date-like values', function() {
    assert.equal(formatDate('2026-06-25T00:00:00.000Z'), '25/06/2026');
    assert.equal(formatDate({ toDate: function() { return new Date('2026-06-25T00:00:00.000Z'); } }), '25/06/2026');
});