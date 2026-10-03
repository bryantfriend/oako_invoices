import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import policy from '../desktop/windowPolicy.cjs';
import updaterModule from '../desktop/updateManager.cjs';
import pipeline from '../js/ICF/engine/pipeline.js';
import { createRestartDesktopUpdateIntent } from '../desktop/renderer/update/RestartDesktopUpdateIntent.js';

test('desktop files remain inside the packaged directory', function() {
    var root = path.resolve('desktop/app');
    assert.equal(policy.resolveAppPath(root, 'korganics://app/index.html'), path.join(root, 'index.html'));
    assert.equal(policy.resolveAppPath(root, 'korganics://app/'), path.join(root, 'index.html'));
    assert.equal(policy.resolveAppPath(root, 'korganics://app/%2e%2e%5csecret.txt'), null);
    assert.equal(policy.resolveAppPath(root, 'korganics://other/index.html'), null);
    assert.equal(policy.resolveAppPath(root, 'file:///secret.txt'), null);
    assert.equal(policy.resolveAppPath(root, 'korganics://app/%ZZ'), null);
});

test('desktop navigation allows public links and local printing only', function() {
    assert.equal(policy.isExternalUrl('https://example.com'), true);
    assert.equal(policy.isExternalUrl('mailto:staff@example.com'), true);
    assert.equal(policy.isExternalUrl('file:///C:/Windows'), false);
    assert.equal(policy.isExternalUrl('javascript:alert(1)'), false);
    assert.equal(policy.isPrintBlobUrl('blob:korganics://app/job-id'), true);
    assert.equal(policy.isPrintBlobUrl('blob:https://example.com/job-id'), false);
});

test('updates download automatically but require a ready update before restarting', async function() {
    var updater = new EventEmitter();
    var installs = 0;
    var checks = 0;
    updater.checkForUpdates = async function() { checks += 1; };
    updater.quitAndInstall = function(silent, runAfter) {
        assert.equal(silent, false);
        assert.equal(runAfter, true);
        installs += 1;
    };
    var states = [];
    var manager = updaterModule.createUpdateManager(updater, function(state) { states.push(state); });
    assert.equal(updater.autoDownload, true);
    assert.equal(updater.autoInstallOnAppQuit, false);
    assert.equal(manager.install(), false);
    await manager.check();
    updater.emit('update-available', { version: '2.77.0' });
    updater.emit('download-progress', { percent: 42.4 });
    await manager.check();
    assert.equal(checks, 1);
    assert.equal(manager.getState().percent, 42);
    updater.emit('update-downloaded', { version: '2.77.0' });
    assert.equal(installs, 0);
    assert.equal(manager.install(), true);
    assert.equal(installs, 1);
    assert.equal(states.at(-1).status, 'ready');
});

function createRestartApi(pending) {
    var state = { pending: pending, restarted: false, syncs: 0 };
    return {
        state: state,
        getUpdateState: async function() { return { status: 'ready' }; },
        listPending: async function() { return state.pending; },
        getUserId: function() { return 'staff'; },
        sync: async function() { state.syncs += 1; state.pending = []; },
        restart: async function() { state.restarted = true; return true; }
    };
}

async function runRestart(api, confirmed) {
    return pipeline.run(createRestartDesktopUpdateIntent({ id: 'staff', role: 'user' }, { confirmed: confirmed }, api));
}

test('restart intent completes all six stages and syncs saved changes first', async function() {
    var api = createRestartApi([{ id: 'pending' }]);
    var result = await runRestart(api, true);
    assert.equal(result.ok, true);
    assert.equal(api.state.syncs, 1);
    assert.equal(api.state.restarted, true);
    assert.equal(result.data.restarting, true);
});

test('restart is blocked for unconfirmed edits, signed-out pending work, or remaining conflicts', async function() {
    var api = createRestartApi([]);
    assert.equal((await runRestart(api, false)).ok, false);
    assert.equal(api.state.restarted, false);
    api = createRestartApi([{ status: 'conflict' }]);
    api.getUserId = function() { return ''; };
    assert.equal((await runRestart(api, true)).ok, false);
    assert.equal(api.state.restarted, false);
    api.getUserId = function() { return 'staff'; };
    api.sync = async function() {};
    assert.equal((await runRestart(api, true)).ok, false);
    assert.equal(api.state.restarted, false);
});

test('restart remains blocked if storage checks fail or the native updater rejects installation', async function() {
    var api = createRestartApi([]);
    api.listPending = async function() { throw new Error('Storage unavailable'); };
    assert.equal((await runRestart(api, true)).ok, false);
    assert.equal(api.state.restarted, false);
    api = createRestartApi([]);
    api.restart = async function() { return false; };
    assert.equal((await runRestart(api, true)).ok, false);
});
