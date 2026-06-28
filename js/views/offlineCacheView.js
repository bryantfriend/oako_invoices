import { layoutView } from "./layoutView.js";
import { offlineCacheService } from "../services/offlineCacheService.js";
import { notificationService } from "../core/notificationService.js";

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function renderDatasetCard(dataset) {
    var readyColor = dataset.ready ? '#166534' : '#92400e';
    var readyBg = dataset.ready ? '#f0fdf4' : '#fffbeb';
    return [
        '<section class="dashboard-card" style="padding: 16px;">',
        '  <div style="display: flex; justify-content: space-between; gap: 12px; align-items: flex-start;">',
        '    <div>',
        '      <h3 style="font-size: 15px; margin: 0; color: var(--color-gray-900);">' + escapeHtml(dataset.label) + '</h3>',
        '      <p style="font-size: 12px; margin: 4px 0 0; color: var(--color-gray-500);">' + escapeHtml(dataset.freshness) + '</p>',
        '    </div>',
        '    <span style="font-size: 11px; font-weight: 900; padding: 4px 8px; border-radius: 999px; background: ' + readyBg + '; color: ' + readyColor + ';">' + (dataset.ready ? 'Ready' : 'Needs refresh') + '</span>',
        '  </div>',
        '  <div style="font-size: 32px; font-weight: 900; color: var(--color-gray-900); margin-top: 16px;">' + dataset.count + '</div>',
        '  <div style="font-size: 11px; color: var(--color-gray-500); margin-top: 2px;">records saved for offline use</div>',
        '</section>'
    ].join('');
}

function renderStatus(status) {
    return [
        '<div class="dashboard-v2 animate-fade-in">',
        '  <div class="dashboard-toolbar">',
        '    <div class="dashboard-title-block">',
        '      <span class="dashboard-eyebrow">Offline Mode</span>',
        '      <h1>Offline Data</h1>',
        '      <p>Check which customer, product, order, and invoice data is saved on this device.</p>',
        '    </div>',
        '    <div class="dashboard-toolbar-actions">',
        '      <button id="refresh-offline-data-btn" class="btn btn-primary">Refresh Offline Data</button>',
        '    </div>',
        '  </div>',
        '  <section class="dashboard-card" style="padding: 16px; margin-bottom: 16px;">',
        '    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px;">',
        '      <div><div style="font-size: 11px; font-weight: 900; color: var(--color-gray-500); text-transform: uppercase;">Connection</div><div style="font-size: 18px; font-weight: 900; color: var(--color-gray-900);">' + escapeHtml(status.connectionMode) + '</div></div>',
        '      <div><div style="font-size: 11px; font-weight: 900; color: var(--color-gray-500); text-transform: uppercase;">Pending Sync</div><div style="font-size: 18px; font-weight: 900; color: var(--color-gray-900);">' + status.pendingSyncCount + '</div></div>',
        '      <div><div style="font-size: 11px; font-weight: 900; color: var(--color-gray-500); text-transform: uppercase;">Failed Sync</div><div style="font-size: 18px; font-weight: 900; color: var(--color-gray-900);">' + status.failedSyncCount + '</div></div>',
        '    </div>',
        status.connectionReason ? '    <p style="font-size: 12px; color: var(--color-gray-500); margin: 12px 0 0;">' + escapeHtml(status.connectionReason) + '</p>' : '',
        '  </section>',
        '  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px;">',
        (status.datasets || []).map(renderDatasetCard).join(''),
        '  </div>',
        '</div>'
    ].join('');
}

export async function renderOfflineCache() {
    layoutView.render();
    layoutView.updateTitle('Offline Data');
    var container = document.getElementById('page-container');
    container.innerHTML = '<div style="padding: 32px; color: var(--color-gray-500);">Loading offline data status...</div>';

    async function loadStatus() {
        var status = await offlineCacheService.getStatus();
        container.innerHTML = renderStatus(status);
        var refreshButton = document.getElementById('refresh-offline-data-btn');
        if (refreshButton) {
            refreshButton.addEventListener('click', async function(event) {
                var button = event.currentTarget;
                button.disabled = true;
                button.textContent = 'Refreshing...';
                var result = await offlineCacheService.refreshOfflineData();
                if (!result.ok && result.reason) {
                    notificationService.error(result.reason);
                } else if (!result.ok) {
                    notificationService.error('Offline data refreshed with ' + result.failedCount + ' problem(s).');
                } else {
                    notificationService.success('Offline data refreshed.');
                }
                await loadStatus();
            });
        }
    }

    await loadStatus();
}
