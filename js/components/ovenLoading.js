// Visual feedback only: business actions continue through their existing ICF flows.
var tasks = new Map();
var markers = new Map();
var sequence = 0;
var panel = null;
var timer = null;
var observer = null;
var hideTimer = null;
var markerSelector = '[data-oven-wait], .loading-screen, .loading-skeleton, .ops-loading, .workflow-loading, [aria-busy="true"]';

function escapeText(value) {
    return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function ovenMarkup(label) {
    return '<section class="oven-card" aria-label="Loading progress">' +
        '<div class="oven-eyebrow">FRESH FROM THE OVEN</div>' +
        '<div class="oven-art" aria-hidden="true"><div class="oven-steam"><i></i><i></i><i></i></div>' +
        '<div class="oven-chimney"></div><div class="oven-dome"><div class="oven-mouth">' +
        '<div class="oven-fire"><b></b><b></b><b></b></div><div class="oven-heat"><i></i><i></i><i></i></div><div class="oven-loaf"><i></i><i></i><i></i></div></div></div>' +
        '<div class="oven-hearth"></div><div class="oven-sprig">❧</div></div>' +
        '<div class="oven-baking-stage" data-oven-stage aria-hidden="true">Warming the dough</div>' +
        '<div class="oven-meter" role="progressbar" aria-label="Loading" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><strong data-oven-percent>0%</strong></div>' +
        '<h2 data-oven-label role="status" aria-live="polite">' + escapeText(label || 'Getting things ready') + '</h2>' +
        '<p data-oven-detail>Estimated progress · Working…</p>' +
        '<div class="oven-crumbs" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>' +
        '</section>';
}

export function paintOven(root, percent, label, estimated, detail) {
    if (!root) return;
    var value = Math.max(0, Math.min(100, Math.floor(percent)));
    root.style.setProperty('--bake', String(value / 100));
    // Apply concrete frame values so every browser and print popup shows the same bake.
    var rise = Math.min(1, value / 65);
    var crust = Math.max(0, (value - 25) / 75);
    root.style.setProperty('--loaf-width', String(0.72 + rise * 0.28));
    root.style.setProperty('--loaf-height', String(0.38 + rise * 0.62));
    root.style.setProperty('--loaf-top', 'rgb(' + Math.round(249 - crust * 51) + ',' + Math.round(236 - crust * 104) + ',' + Math.round(199 - crust * 145) + ')');
    root.style.setProperty('--loaf-bottom', 'rgb(' + Math.round(221 - crust * 87) + ',' + Math.round(200 - crust * 137) + ',' + Math.round(157 - crust * 136) + ')');
    var bakingStage = root.querySelector('[data-oven-stage]');
    var stageText = 'Warming the dough';
    if (value >= 15) stageText = 'The dough is rising';
    if (value >= 45) stageText = 'Baking a golden crust';
    if (value >= 80) stageText = 'Finishing the bake';
    if (value === 100) stageText = 'Freshly baked';
    if (bakingStage && bakingStage.textContent !== stageText) bakingStage.textContent = stageText;
    var count = root.querySelector('[data-oven-percent]');
    var heading = root.querySelector('[data-oven-label]');
    var message = root.querySelector('[data-oven-detail]');
    var meter = root.querySelector('.oven-meter');
    if (count && count.textContent !== value + '%') count.textContent = value + '%';
    if (heading && heading.textContent !== label) heading.textContent = label;
    var description = (estimated ? 'Estimated progress · ' : '') + (detail || 'Working…');
    if (message && message.textContent !== description) message.textContent = description;
    if (meter) {
        meter.setAttribute('aria-valuenow', String(value));
        meter.setAttribute('aria-valuetext', value + '% ' + (estimated ? 'estimated' : 'complete'));
    }
}

function ensurePanel() {
    if (panel && panel.isConnected) return;
    panel = document.createElement('div');
    panel.className = 'oven-overlay';
    panel.innerHTML = ovenMarkup();
    document.body.appendChild(panel);
}

function renderProgress() {
    var current = null;
    var now = Date.now();
    tasks.forEach(function chooseTask(task) {
        if (now - task.started < 100) return;
        if (typeof window !== 'undefined' && task.route !== window.location.hash) return;
        // Prefer measured work (printing, batches) over a containing event/route.
        if (!current || task.measured || !current.measured) current = task;
    });
    if (!current) {
        if (panel) { panel.remove(); panel = null; }
        return;
    }
    if (!document.body) return;
    ensurePanel();
    var elapsed = now - current.started;
    var value = current.percent;
    if (!current.measured) value = Math.min(95, Math.floor(95 * (1 - Math.exp(-elapsed / 12000))));
    var detail = current.detail || 'A little care goes into every step.';
    if (elapsed > 30000 && !current.detail) detail = 'Still working. This is taking longer than usual.';
    paintOven(panel, value, current.label, !current.measured, detail);
}

function releaseTask(id, failed) {
    tasks.delete(id);
    if (tasks.size) {
        renderProgress();
        return;
    }
    clearInterval(timer);
    timer = null;
    if (!panel) return;
    if (failed) {
        panel.remove();
        panel = null;
        return;
    }
    paintOven(panel, 100, 'Ready', false, 'Freshly finished.');
    hideTimer = setTimeout(function hideCompletedOven() {
        if (!tasks.size && panel) {
            panel.remove();
            panel = null;
        }
    }, 240);
}

export function startOvenLoading(label, options) {
    initializeOvenLoading();
    clearTimeout(hideTimer);
    var id = ++sequence;
    var settings = options || {};
    var task = { route: typeof window !== 'undefined' ? window.location.hash : '', started: Date.now(), label: label || 'Getting things ready', percent: 0, measured: settings.measured === true, detail: '' };
    tasks.set(id, task);
    if (!timer) timer = setInterval(renderProgress, 50);
    var ended = false;
    return {
        update: function updateOvenProgress(percent, detail) {
            if (ended) return;
            task.measured = true;
            // Reserve 100% for completion of the actual promise/output.
            task.percent = Math.max(task.percent, Math.min(99, Number(percent) || 0));
            task.detail = detail || '';
            renderProgress();
        },
        finish: function finishOvenProgress() {
            if (ended) return;
            ended = true;
            releaseTask(id, false);
        },
        fail: function failOvenProgress() {
            if (ended) return;
            ended = true;
            releaseTask(id, true);
        }
    };
}

// Wrap foreground handlers at their call sites; background sync is deliberately quiet.
export function withOvenLoading(handler, label) {
    return function trackedForegroundAction() {
        var progress = startOvenLoading(label);
        var result;
        try {
            // Call immediately so popup/print actions keep browser user activation.
            result = handler.apply(this, arguments);
        } catch (error) {
            progress.fail();
            throw error;
        }
        return Promise.resolve(result).then(function actionFinished(value) {
            if (value === false) progress.fail();
            else progress.finish();
            return value;
        }, function actionFailed(error) {
            progress.fail();
            throw error;
        });
    };
}

export function startPrintWindowLoading(popup, label) {
    var progress = startOvenLoading(label);
    var started = Date.now();
    var percent = null;
    var detail = '';
    var popupPanel = null;
    var popupTimer = setInterval(function updatePrintWindowOven() {
        if (!popup || popup.closed) {
            clearInterval(popupTimer);
            progress.fail();
            return;
        }
        if (Date.now() - started < 100) return;
        // document.write replaces the preparation page before assets have loaded.
        if (!popupPanel || !popupPanel.isConnected) {
            var styles = popup.document.createElement('link');
            styles.rel = 'stylesheet';
            styles.href = new URL('../../css/oven-loading.css', import.meta.url).href;
            popup.document.head.appendChild(styles);
            popupPanel = popup.document.createElement('div');
            popupPanel.className = 'oven-overlay';
            popupPanel.innerHTML = ovenMarkup(label);
            popup.document.body.appendChild(popupPanel);
        }
        var value = percent;
        if (value === null) value = Math.min(95, 95 * (1 - Math.exp(-(Date.now() - started) / 12000)));
        paintOven(popupPanel, value, label, percent === null, detail);
    }, 50);
    return {
        update: function updatePrintProgress(value, message) {
            percent = Math.min(99, value);
            detail = message;
            progress.update(value, message);
        },
        finish: function finishPrintProgress() {
            clearInterval(popupTimer);
            if (popupPanel) popupPanel.remove();
            progress.finish();
        },
        fail: function failPrintProgress() {
            clearInterval(popupTimer);
            if (popupPanel) popupPanel.remove();
            progress.fail();
        }
    };
}

export function buildOvenWaitingDocument(label) {
    var stylesheet = new URL('../../css/oven-loading.css', import.meta.url).href;
    // This small standalone timer belongs to the reserved print tab. It stops
    // as soon as that document is replaced by an invoice or a visible error.
    return '<!doctype html><html><head><title>Preparing invoices</title><link rel="stylesheet" href="' +
        escapeText(stylesheet) + '"></head><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#f7f3e7;font-family:system-ui;color:#214534;">' +
        ovenMarkup(label) + '<script>' + paintOven.toString() +
        ';var started=Date.now();var waitTimer=setInterval(function updateReservedPrintTab(){' +
        'if(!document.querySelector(".oven-card")){clearInterval(waitTimer);return;}' +
        'var percent=Math.min(95,95*(1-Math.exp(-(Date.now()-started)/12000)));' +
        'paintOven(document.body,percent,' + JSON.stringify(label).replace(/</g, '\\u003c') + ',true,"Preparing your saved invoice.");' +
        '},100);<\/script></body></html>';
}

function scanLoadingMarkers() {
    markers.forEach(function removeFinishedMarker(handle, element) {
        if (!element.isConnected || !element.matches(markerSelector) || element.closest('[hidden], .hidden')) {
            handle.finish();
            markers.delete(element);
        }
    });
    document.querySelectorAll(markerSelector).forEach(function trackLoadingMarker(element) {
        if (element.closest('.oven-overlay, [hidden], .hidden') || markers.has(element)) return;
        var label = element.getAttribute('data-oven-wait') || element.getAttribute('aria-label') || 'Getting things ready';
        markers.set(element, startOvenLoading(label));
    });
}

export function initializeOvenLoading() {
    if (typeof document === 'undefined' || observer || !document.documentElement) return;
    if (!document.querySelector('link[data-oven-styles]')) {
        var styles = document.createElement('link');
        styles.rel = 'stylesheet';
        styles.href = new URL('../../css/oven-loading.css', import.meta.url).href;
        styles.setAttribute('data-oven-styles', '');
        document.head.appendChild(styles);
    }
    observer = new MutationObserver(scanLoadingMarkers);
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-busy', 'data-oven-wait', 'class'] });
    scanLoadingMarkers();
}

initializeOvenLoading();
