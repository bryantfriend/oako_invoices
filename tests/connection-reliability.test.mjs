import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModule } from './helpers/load-isolated-module.mjs';

test('server reads ignore cache snapshots and cancel listeners after success or timeout', async function() {
    var receive;
    var stopped = 0;
    var module = await loadModule('js/core/firestoreServerRead.js', {
        'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js': {
            onSnapshot: function(reference, options, next) {
                receive = next;
                assert.equal(options.includeMetadataChanges, true);
                return function unsubscribe() { stopped += 1; };
            }
        }
    });
    var first = module.readServerSnapshot({}, 100, function timeout() { return new Error('deadline'); });
    receive({ metadata: { fromCache: true }, docs: [] });
    assert.equal(stopped, 0);
    receive({ metadata: { fromCache: false }, docs: [] });
    assert.equal((await first).docs.length, 0);
    assert.equal(stopped, 1);
    await assert.rejects(module.readServerSnapshot({}, 5, function timeout() { return new Error('deadline'); }), /deadline/);
    assert.equal(stopped, 2);
});

test('a stalled collection releases its slot and queued reads get their own deadline', async function() {
    var started = [];
    var completedReads = 0;
    var module = await loadModule('js/core/firestoreRead.js', {
        firestoreServerRead: { readServerSnapshot: function(reference, timeoutMs, createError) {
            started.push(reference.id);
            return new Promise(function(resolve, reject) {
                setTimeout(function complete() {
                    if (reference.stalled) reject(createError());
                    else resolve({ docs: [], metadata: { fromCache: false } });
                }, reference.stalled ? timeoutMs : 8);
            });
        } },
        'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js': { getDocsFromCache: async function() { return { docs: [] }; } },
        connectionStateService: { connectionStateService: {
            getSnapshot: function() { return { browserOnline: true, mode: 'online' }; },
            markSuccessfulFirestoreRead: function() { completedReads += 1; }
        } },
        offlineDexieDb: { openOfflineDexieDatabase: async function() { return {}; } },
        firestoreDiagnostics: { logCollectionError: function() {}, createCollectionTimeoutError: function() { return new Error('deadline'); } }
    });
    var promises = [];
    for (var index = 0; index < 5; index += 1) {
        promises.push(module.getDocsWithCache({ id: index, stalled: index < 2 }, { timeoutMs: 10 }));
    }
    var results = await Promise.allSettled(promises);
    assert.deepEqual(started, [0, 1, 2, 3, 4]);
    assert.equal(results[0].status, 'rejected');
    assert.equal(results[1].status, 'rejected');
    assert.equal(results[4].status, 'fulfilled');
    assert.equal(completedReads, 3);
});

async function loadConnection(readServerSnapshot) {
    return (await loadModule('js/services/connectionStateService.js', {
        firebase: { db: {} },
        'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js': { doc: function() { return {}; } },
        firestoreServerRead: { readServerSnapshot: readServerSnapshot },
        offlineQueueService: { offlineQueueService: { init: async function() {}, getSummary: async function() { return {}; } } }
    }, {
        navigator: { onLine: true },
        fetch: async function() { return { ok: true }; }
    })).connectionStateService;
}

test('successful Firestore checks mark online immediately without a second polling interval', async function() {
    var service = await loadConnection(async function(reference, timeoutMs) {
        assert.equal(timeoutMs, 15000);
        return {};
    });
    assert.equal((await service.refresh()).mode, 'online');
    assert.equal(service.isCloudReachable(), true);
});

test('an old failed probe cannot overwrite a successful data read and forced probes deduplicate', async function() {
    var rejectProbe;
    var calls = 0;
    var started;
    var ready = new Promise(function(resolve) { started = resolve; });
    var service = await loadConnection(function() {
        calls += 1;
        started();
        return new Promise(function(resolve, reject) { rejectProbe = reject; });
    });
    var first = service.refresh();
    await ready;
    var second = service.refresh({ force: true });
    service.markSuccessfulFirestoreRead();
    rejectProbe(new Error('old timeout'));
    assert.equal((await first).mode, 'online');
    assert.equal((await second).mode, 'online');
    assert.equal(calls, 1);
});

test('permission errors explain cloud authorization instead of blaming the internet', async function() {
    var service = await loadConnection(async function() {
        throw Object.assign(new Error('denied'), { code: 'permission-denied' });
    });
    var result = await service.refresh();
    assert.equal(result.mode, 'degraded');
    assert.match(result.reason, /staff sign-in and permissions/);
});
