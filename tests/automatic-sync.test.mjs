import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../js/services/automaticSyncService.js', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace('export function', 'function');

function harness() {
    var timers = [];
    var intervals = [];
    var events = {};
    var queueChanged;
    var calls = 0;
    var reads = 0;
    var items = [];
    var context = vm.createContext({
        auth: { currentUser: { uid: 'user-1' } },
        offlineStatusService: { isOnline: function() { return true; } },
        offlineQueueService: {
            subscribe: function(callback) { queueChanged = callback; },
            listProcessableItems: async function(actor, options) {
                reads += 1;
                assert.equal(actor, 'user-1');
                assert.equal(options, undefined, 'Automatic sync must honor retry delays');
                return items;
            }
        },
        syncService: { processQueue: async function(options) {
            assert.equal(options, undefined, 'Automatic sync must not force manual retries');
            calls += 1;
            items = [];
            queueChanged();
        } },
        window: {
            setTimeout: function(callback, delay) { assert.equal(delay, 250); timers.push(callback); },
            setInterval: function(callback, delay) { assert.equal(delay, 5000); intervals.push(callback); },
            addEventListener: function(name, callback) { events[name] = callback; }
        },
        document: { visibilityState: 'visible', addEventListener: function(name, callback) { events[name] = callback; } },
        console: { warn: function() {} }
    });
    vm.runInContext(source, context);
    context.initializeAutomaticSync();
    return {
        context: context, intervals: intervals, events: events,
        change: function(next) { items = next; queueChanged(); },
        flush: async function() {
            var batch = timers.splice(0);
            batch.forEach(function(callback) { callback(); });
            await new Promise(function(resolve) { setImmediate(resolve); });
        },
        calls: function() { return calls; }, reads: function() { return reads; }
    };
}

test('new saves wake one sync and processing notifications do not loop', async function() {
    var h = harness();
    h.context.initializeAutomaticSync();
    assert.equal(h.intervals.length, 1);
    h.change([{ id: 'save' }]);
    h.change([{ id: 'save' }]);
    await h.flush();
    assert.equal(h.calls(), 1);
    await h.flush();
    assert.equal(h.calls(), 1);
});

test('periodic wake syncs due retries without another save or reconnect', async function() {
    var h = harness();
    var due = false;
    h.context.offlineQueueService.listProcessableItems = async function() { return due ? [{}] : []; };
    await h.flush();
    assert.equal(h.calls(), 0);
    due = true;
    h.intervals[0]();
    await h.flush();
    assert.equal(h.calls(), 1);
});

test('offline and signed-out sessions do not attempt sync; returning to the app wakes it', async function() {
    var h = harness();
    h.change([{}]);
    h.context.offlineStatusService.isOnline = function() { return false; };
    await h.flush();
    assert.equal(h.reads(), 0);
    h.context.offlineStatusService.isOnline = function() { return true; };
    h.context.auth.currentUser = null;
    h.events.focus();
    await h.flush();
    assert.equal(h.reads(), 0);
    h.context.auth.currentUser = { uid: 'user-1' };
    h.events.visibilitychange();
    await h.flush();
    assert.equal(h.calls(), 1);
});

test('slow sync cannot overlap another automatic run and exceptions allow later attempts', async function() {
    var h = harness();
    var release;
    h.change([{}]);
    h.context.syncService.processQueue = function() { return new Promise(function(resolve) { release = resolve; }); };
    await h.flush();
    h.intervals[0]();
    await h.flush();
    assert.equal(h.reads(), 1);
    release();
    await new Promise(function(resolve) { setImmediate(resolve); });
    h.context.syncService.processQueue = async function() { throw new Error('temporary failure'); };
    h.intervals[0]();
    await h.flush();
    h.intervals[0]();
    await h.flush();
    assert.equal(h.reads(), 3);
});
