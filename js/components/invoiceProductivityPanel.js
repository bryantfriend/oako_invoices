import { summarizeWorkflowEvents, buildBakeryProgress } from '../core/invoiceProductivity.js';
import { getLocalDateKey } from '../services/operationsPlanningService.js';
import { workflowLocalStore } from '../services/workflowLocalStore.js';
import { gamificationService } from '../services/gamificationService.js';
import { wakeWorkflowEffects } from '../services/workflowEffectsService.js';

function duration(value) {
    return value === null ? 'No samples yet' : (value / 1000).toFixed(1) + ' sec';
}

export function mountInvoiceProductivityPanel(mount, orders, selectedDate) {
    if (!mount) return;
    var preferences = workflowLocalStore.preference();
    var cutoff = Date.now() - 30 * 86400000;
    var recentEvents = workflowLocalStore.read('metrics', 'recent', []).filter(function (event) {
        return event.at >= cutoff;
    });
    var stats = summarizeWorkflowEvents(recentEvents);
    var today = selectedDate || getLocalDateKey(new Date());
    var dateLabel =
        today === getLocalDateKey(new Date()) ? 'Today’s shared bakery' : 'Shared bakery · ' + today;
    var bakery = buildBakeryProgress(orders || [], today);
    var effects = workflowLocalStore.list('effects');
    var loaves = '';
    for (var index = 0; index < Math.min(12, bakery.total); index += 1) {
        var filled = index < Math.round((12 * bakery.printed) / Math.max(12, bakery.total));
        loaves += '<span class="bakery-loaf ' + (filled ? 'is-baked' : '') + '" aria-hidden="true">🥖</span>';
    }
    mount.innerHTML =
        '<section class="workflow-panel"><div class="workflow-action-row"><div><strong>Invoice rhythm</strong><small>Last 30 days on this device · ' +
        stats.prepared +
        ' preparations measured</small></div>' +
        '<a href="#/daily-invoices" class="btn btn-secondary btn-sm">Daily invoice batch</a><label><input type="checkbox" data-preference="compact" ' +
        (preferences.compact ? 'checked' : '') +
        '> Compact work view</label>' +
        '<label><input type="checkbox" data-preference="fun" ' +
        (preferences.fun ? 'checked' : '') +
        '> Bakery progress</label></div>' +
        '<div class="workflow-metrics"><div><small>Typical active entry</small><strong>' +
        duration(stats.entryMs) +
        '</strong></div><div><small>Typical preparation wait</small><strong>' +
        duration(stats.prepareMs) +
        '</strong></div>' +
        '<div><small>Preparation failures</small><strong>' +
        stats.failures +
        '</strong></div><div><small>Reprints / corrections</small><strong>' +
        stats.reprints +
        ' / ' +
        stats.corrections +
        '</strong></div>' +
        '<div><small>Typical daily batch</small><strong>' +
        duration(stats.batchMs) +
        '</strong></div></div>' +
        (stats.prepared
            ? '<p class="workflow-hint">' +
              (stats.failures
                  ? 'Preparation errors are interrupting work. Retry saved orders from the editor or batch worksheet.'
                  : stats.entryMs > stats.prepareMs
                    ? 'Most measured time is entry. Try the daily batch or usual baskets.'
                    : 'Preparation is the larger measured delay. Check pending background work and connection status.') +
              '</p>'
            : '<p class="workflow-hint">Create and print an invoice to begin measuring. Idle gaps over 30 seconds are excluded from entry time.</p>') +
        '<details><summary>Background work: ' +
        effects.length +
        ' pending</summary><p>Sheets and rewards retry automatically while this app is open. Work stays saved on this device if you close it.</p><button class="btn btn-secondary btn-sm" id="workflow-retry-effects">Retry now</button></details>' +
        (preferences.fun
            ? '<div class="bakery-progress"><div><span class="workflow-eyebrow">' +
              dateLabel +
              '</span><strong>' +
              bakery.printed +
              ' of ' +
              bakery.total +
              ' orders confirmed printed</strong><p>' +
              (bakery.complete
                  ? 'The day’s tray is ready! 🥳'
                  : bakery.total
                    ? 'Every completed invoice adds a loaf to the tray.'
                    : 'Your first order starts the tray.') +
              '</p></div><div class="bakery-tray">' +
              loaves +
              '</div><label><input type="checkbox" data-preference="sound" ' +
              (preferences.sound ? 'checked' : '') +
              '> Sound</label><label><input type="checkbox" data-preference="motion" ' +
              (preferences.motion ? 'checked' : '') +
              '> Celebration animation</label></div>'
            : '') +
        '</section>';
    var dashboard = mount.closest('.invoice-batch-workspace') || document.querySelector('.dashboard-v2');
    if (dashboard) dashboard.classList.toggle('workflow-compact', preferences.compact);
    mount.querySelectorAll('[data-preference]').forEach(function (input) {
        input.onchange = function () {
            preferences[input.dataset.preference] = input.checked;
            workflowLocalStore.write('preferences', 'desk', preferences);
            mountInvoiceProductivityPanel(mount, orders, selectedDate);
        };
    });
    mount.querySelector('#workflow-retry-effects').onclick = function () {
        effects.forEach(function (effect) {
            effect.nextAt = 0;
            workflowLocalStore.write('effects', effect.id, effect);
        });
        wakeWorkflowEffects();
        this.textContent = 'Retry scheduled';
    };
    if (preferences.fun && bakery.complete && !workflowLocalStore.read('celebrated', today, false)) {
        workflowLocalStore.write('celebrated', today, true);
        gamificationService.celebrateBadge({
            icon: '🥖',
            name: 'The day’s tray is ready!',
            description: 'All ' + bakery.total + ' orders for today are confirmed printed.',
        });
    }
}
