import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Exercise the production merge with controlled server/cache provenance and revisions.
var source = fs.readFileSync(new URL('../js/services/sessionDataStore.js', import.meta.url), 'utf8');
var context = vm.createContext({});
vm.runInContext(source.slice(source.indexOf('function getMillis('), source.indexOf('async function readDexieCache(')), context);
var merge = context.mergeRecordsByFreshness;
var oldOrder = { id: 'old', archived: false, updatedAt: '2026-09-13T06:00:00Z' };

test('a complete server refresh removes stale rows absent from the server', function() {
    assert.equal(merge([oldOrder], [], true, {}, 1).length, 0);
});

test('a partial or offline cached refresh does not erase known orders', function() {
    assert.equal(merge([oldOrder], [], false, {}, 1).length, 1);
});

test('a create or archive during a refresh wins even with an older client clock', function() {
    var archived = { id: 'old', archived: true, updatedAt: '2026-09-13T05:00:00Z' };
    var changes = { old: { revision: 2 } };
    assert.equal(merge([archived], [oldOrder], true, changes, 1)[0].archived, true);
    assert.equal(merge([archived], [], true, changes, 1).length, 1);
});

test('explicitly removed rows cannot be resurrected by an in-flight or cached read', function() {
    assert.equal(merge([], [oldOrder], false, { old: { revision: 2, removed: true } }, 1).length, 0);
    assert.equal(merge([], [oldOrder], true, { old: { revision: 2, removed: true } }, 2).length, 0);
});

test('queued local creates included by the order service survive server refresh', function() {
    var local = { id: 'local', syncStatus: 'pending', syncAction: 'create' };
    assert.equal(merge([oldOrder], [local], true, {}, 1)[0].id, 'local');
});
