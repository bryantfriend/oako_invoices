import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppInstallService } from '../js/services/appInstallService.js';

function createBrowser(standalone) {
    var events = {};
    return {
        isSecureContext: true,
        navigator: {},
        matchMedia: function() { return { matches: Boolean(standalone), addEventListener: function() {} }; },
        addEventListener: function(name, listener) { events[name] = listener; },
        dispatch: function(name, event) { events[name](event); }
    };
}

function offerPrompt(browser, outcome, prompt) {
    var prevented = false;
    browser.dispatch('beforeinstallprompt', {
        preventDefault: function() { prevented = true; },
        prompt: prompt || async function() {},
        userChoice: Promise.resolve({ outcome: outcome })
    });
    assert.equal(prevented, true);
}

test('install prompts require availability and are consumed once, including dismissal', async function() {
    var browser = createBrowser();
    var service = createAppInstallService(browser);
    assert.equal((await service.install()).outcome, 'unavailable');
    var calls = 0;
    offerPrompt(browser, 'dismissed', async function() { calls += 1; });
    assert.equal(service.getState().canPrompt, true);
    assert.equal((await service.install()).outcome, 'dismissed');
    assert.equal((await service.install()).outcome, 'unavailable');
    assert.equal(calls, 1);
});

test('accepted prompt waits for browser installation event before claiming installed', async function() {
    var browser = createBrowser();
    var service = createAppInstallService(browser);
    offerPrompt(browser, 'accepted');
    assert.equal((await service.install()).outcome, 'accepted');
    assert.equal(service.getState().installed, false);
    browser.dispatch('appinstalled');
    assert.equal(service.getState().installed, true);
    assert.equal(service.getState().canPrompt, false);
});

test('standalone and iOS launches recognize installation without a prompt', function() {
    assert.equal(createAppInstallService(createBrowser(true)).getState().installed, true);
    var browser = createBrowser();
    browser.navigator.standalone = true;
    assert.equal(createAppInstallService(browser).getState().installed, true);
});

test('failed prompts recover and prevent double clicks while awaiting browser choice', async function() {
    var browser = createBrowser();
    var service = createAppInstallService(browser);
    var release;
    offerPrompt(browser, 'accepted', function() { return new Promise(function(resolve) { release = resolve; }); });
    var first = service.install();
    assert.equal(service.getState().busy, true);
    assert.equal((await service.install()).outcome, 'unavailable');
    release();
    await first;
    offerPrompt(browser, 'accepted', async function() { throw new Error('Browser rejected prompt'); });
    assert.equal((await service.install()).outcome, 'error');
    assert.equal(service.getState().busy, false);
});

test('unsubscribed views receive no further installation notifications', function() {
    var browser = createBrowser();
    var service = createAppInstallService(browser);
    var calls = 0;
    var unsubscribe = service.subscribe(function() { calls += 1; });
    unsubscribe();
    browser.dispatch('appinstalled');
    assert.equal(calls, 1);
});
