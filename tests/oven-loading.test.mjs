import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function harness() {
    var now = 0;
    var nextId = 0;
    var timers = new Map();
    var markerElements = [];
    var observerCallback;
    function element() {
        return {
            isConnected: true, children: [], attributes: {}, parts: {}, textContent: '',
            style: { setProperty: function() {} },
            appendChild: function(child) { child.parent = this; this.children.push(child); },
            remove: function() { this.isConnected = false; },
            setAttribute: function(key, value) { this.attributes[key] = value; },
            getAttribute: function(key) { return this.attributes[key]; },
            closest: function() { return null; },
            matches: function() { return this.busy !== false; },
            querySelector: function(selector) {
                if (!this.parts[selector]) this.parts[selector] = element();
                return this.parts[selector];
            }
        };
    }
    var body = element();
    var document = {
        head: element(), body: body, documentElement: element(),
        createElement: element,
        querySelector: function() { return {}; },
        querySelectorAll: function() { return markerElements.filter(function(marker) { return marker.isConnected && marker.busy !== false; }); }
    };
    function schedule(callback, delay, repeat) {
        var id = ++nextId;
        timers.set(id, { callback: callback, due: now + delay, repeat: repeat });
        return id;
    }
    var context = vm.createContext({
        document: document, window: { location: { hash: '#/orders' } },
        Date: { now: function() { return now; } }, URL: URL,
        MutationObserver: class { constructor(callback) { observerCallback = callback; } observe() {} },
        setInterval: function(callback, delay) { return schedule(callback, delay, delay); },
        setTimeout: function(callback, delay) { return schedule(callback, delay, 0); },
        clearInterval: function(id) { timers.delete(id); }, clearTimeout: function(id) { timers.delete(id); }
    });
    var source = fs.readFileSync('js/components/ovenLoading.js', 'utf8')
        .replace(/^export /gm, '').replaceAll('import.meta.url', "'https://example.test/js/components/ovenLoading.js'");
    vm.runInContext(source, context);
    return {
        api: context,
        advance: function(ms) {
            var target = now + ms;
            while (true) {
                var chosen = null;
                timers.forEach(function(timer, id) {
                    if (timer.due <= target && (!chosen || timer.due < chosen.timer.due)) chosen = { id: id, timer: timer };
                });
                if (!chosen) break;
                now = chosen.timer.due;
                if (chosen.timer.repeat) chosen.timer.due += chosen.timer.repeat;
                else timers.delete(chosen.id);
                chosen.timer.callback();
            }
            now = target;
        },
        panel: function() { return body.children.findLast(function(child) { return child.isConnected && child.className === 'oven-overlay'; }); },
        mark: function() { var marker = element(); markerElements.push(marker); observerCallback(); return marker; },
        scan: function() { observerCallback(); },
        timers: timers
    };
}

test('oven appears at 100ms, avoids flashing for quick actions, and cleans up timers', function() {
    var h = harness();
    var quick = h.api.startOvenLoading('Quick');
    h.advance(99);
    assert.equal(h.panel(), undefined);
    quick.finish();
    h.advance(500);
    assert.equal(h.panel(), undefined);
    var slow = h.api.startOvenLoading('Saving');
    h.advance(100);
    assert.ok(h.panel());
    slow.finish();
    assert.equal(h.panel().querySelector('[data-oven-percent]').textContent, '100%');
    h.advance(240);
    assert.equal(h.panel(), undefined);
    assert.equal(h.timers.size, 0);
});

test('unmeasurable progress is labeled estimated and cannot claim completion', function() {
    var h = harness();
    var task = h.api.startOvenLoading('Connecting');
    h.advance(120000);
    assert.equal(h.panel().querySelector('[data-oven-percent]').textContent, '94%');
    assert.match(h.panel().querySelector('[data-oven-detail]').textContent, /Estimated progress.*longer than usual/);
    task.fail();
    assert.equal(h.panel(), undefined);
    assert.equal(h.timers.size, 0);
});

test('measured progress stays monotonic below 100 and concurrent tasks cannot close each other', function() {
    var h = harness();
    var outer = h.api.startOvenLoading('Saving');
    var measured = h.api.startOvenLoading('Printing', { measured: true });
    h.advance(100);
    measured.update(67, 'Two of three ready');
    measured.update(20, 'Still working');
    assert.equal(h.panel().querySelector('[data-oven-percent]').textContent, '67%');
    outer.finish();
    outer.finish();
    assert.ok(h.panel());
    measured.update(100, 'Opening preview');
    assert.equal(h.panel().querySelector('[data-oven-percent]').textContent, '99%');
    measured.finish();
    assert.equal(h.panel().querySelector('.oven-meter').attributes['aria-valuenow'], '100');
    h.advance(240);
    assert.equal(h.panel(), undefined);
});

test('removed loading placeholders and stale routes release visible feedback', function() {
    var h = harness();
    var marker = h.mark();
    h.advance(100);
    assert.ok(h.panel());
    marker.remove();
    h.scan();
    h.advance(240);
    assert.equal(h.panel(), undefined);
    var stale = h.api.startOvenLoading('Old page');
    h.advance(100);
    h.api.window.location.hash = '#/customers';
    h.advance(50);
    assert.equal(h.panel(), undefined);
    stale.finish();
    assert.equal(h.timers.size, 0);
});

test('foreground wrapper preserves this, synchronous popup activation, results and rejection cleanup', async function() {
    var h = harness();
    var started = false;
    var resolve;
    var handler = h.api.withOvenLoading(function(value) {
        assert.equal(this.name, 'owner');
        assert.equal(value, 7);
        started = true;
        return new Promise(function(done) { resolve = done; });
    }, 'Printing');
    var promise = handler.call({ name: 'owner' }, 7);
    assert.equal(started, true);
    h.advance(100);
    assert.ok(h.panel());
    resolve('done');
    assert.equal(await promise, 'done');
    h.advance(240);
    await assert.rejects(h.api.withOvenLoading(async function() { throw new Error('Denied'); })(), /Denied/);
    assert.equal(h.panel(), undefined);
    assert.equal(h.timers.size, 0);
});


test('bread changes from flat pale dough to risen golden crust as measured work advances', function() {
    var h = harness();
    var task = h.api.startOvenLoading('Baking preview', { measured: true });
    h.advance(100);
    var root = h.panel();
    var styles = {};
    root.style.setProperty = function(name, value) { styles[name] = value; };
    task.update(0);
    assert.equal(root.querySelector('[data-oven-stage]').textContent, 'Warming the dough');
    var doughHeight = Number(styles['--loaf-height']);
    var doughColor = styles['--loaf-top'];
    task.update(35);
    assert.equal(root.querySelector('[data-oven-stage]').textContent, 'The dough is rising');
    assert.ok(Number(styles['--loaf-height']) > doughHeight);
    task.update(75);
    assert.equal(root.querySelector('[data-oven-stage]').textContent, 'Baking a golden crust');
    assert.notEqual(styles['--loaf-top'], doughColor);
    assert.equal(Number(styles['--loaf-height']), 1);
    task.finish();
    assert.equal(root.querySelector('[data-oven-stage]').textContent, 'Freshly baked');
});
