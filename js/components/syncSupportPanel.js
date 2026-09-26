import { withOvenLoading } from './ovenLoading.js';
import { syncSupportService } from '../services/syncSupportService.js';
import { collectSyncSupport } from '../services/syncSupportCollector.js';
import { syncRecoveryService } from '../services/syncRecoveryService.js';
import { syncService } from '../services/syncService.js';

function escapeHtml(value) {
    return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

export function getSyncIssueGuidance(issue) {
    if (issue.status === 'acknowledged') {
        return 'Recovered. Kept in this report for reference.';
    }
    if (issue.source === 'sheets') {
        return 'Check Settings and the destination sheet. Include this entry in your report so delivery receipts and duplicate protection can be configured.';
    }
    if (issue.source === 'print') {
        return 'This invoice was skipped during Quick Print. Include the error in your report; retry printing after its invoice data or QR issue is corrected.';
    }
    if (issue.status === 'conflict') {
        return 'Compare the versions above. Choose which changes to keep before continuing.';
    }
    if (issue.status === 'blocked_authentication') {
        return 'Sign in with the original staff account. Automatic recovery will check again; you can also retry below.';
    }
    if (issue.errorCode.indexOf('permission') !== -1) {
        return 'The account or requested operation was denied. Send the report for review, then retry after access is corrected.';
    }
    if (issue.needsReview) {
        return 'Include this entry in your report. Retry only after its data or configuration has been corrected.';
    }
    return 'Waiting for automatic recovery. Your saved changes remain on this device.';
}

export function renderSyncSupportReport(report) {
    var rows = report.issues.slice().reverse();
    var labels = {
        acknowledged: 'Recovered', failed_terminal: 'Needs correction', blocked_authentication: 'Sign-in needed',
        conflict: 'Decision needed', needs_review: 'Review needed', retry_wait: 'Waiting to retry',
        pending: 'Waiting to sync', syncing: 'Syncing'
    };
    return '<section class="card" aria-labelledby="sync-support-title" style="display:grid;gap:14px;">' +
        '<h2 id="sync-support-title" style="margin:0;font-size:20px;">Sync issues and support report</h2>' +
        '<p>Issues are collected quietly on this browser for your account. Copy or download this report when you want help. Nothing is sent automatically. Invoice contents and credentials are excluded.</p>' +
        '<p style="font-size:12px;">Up to 200 issues from the last 30 days. Reports may include record IDs and error messages.</p>' +
        (report.storageUnavailable ? '<p role="status">Local diagnostics storage is unavailable; some issues may not be recorded.</p>' : '') +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;"><button type="button" class="btn btn-secondary" data-support="copy">Copy report</button><button type="button" class="btn btn-secondary" data-support="download">Download report</button><button type="button" class="btn btn-secondary" data-support="refresh">Refresh details</button></div>' +
        '<p data-support-status role="status" aria-live="polite"></p>' +
        (rows.length === 0 ? '<p>No sync issues have been collected for this account.</p>' : rows.map(function(issue) {
            var retryable = issue.source === 'queue' && ['blocked_authentication', 'failed_terminal'].indexOf(issue.status) !== -1;
            return '<details style="border-top:1px solid var(--color-gray-200);padding-top:10px;"><summary style="cursor:pointer;">' +
                escapeHtml(issue.entityId || issue.id || 'Configuration') + ' — ' + escapeHtml(labels[issue.status] || 'Review needed') +
                '</summary><p>' + escapeHtml(getSyncIssueGuidance(issue)) + '</p><p>' + escapeHtml(issue.message) +
                '</p><p style="font-size:12px;">Code: ' + escapeHtml(issue.errorCode || 'unknown') + ' · Attempts: ' + Number(issue.attemptCount || 0) +
                ' · Last seen: ' + escapeHtml(issue.lastSeenAt) + '</p>' +
                (retryable ? '<button type="button" class="btn btn-secondary btn-sm" data-retry-sync="' + escapeHtml(issue.id) + '">Retry after correction</button>' : '') + '</details>';
        }).join('')) + '</section>';
}

export async function mountSyncSupportPanel(container) {
    await collectSyncSupport().catch(function() {});
    var report = await syncSupportService.getReport();
    if (!container.isConnected) {
        return;
    }
    container.innerHTML = renderSyncSupportReport(report);
    container.querySelectorAll('[data-support]').forEach(function(button) {
        button.addEventListener('click', withOvenLoading(async function() {
            var status = container.querySelector('[data-support-status]');
            button.disabled = true;
            try {
                if (button.dataset.support === 'refresh') {
                    await mountSyncSupportPanel(container);
                    return;
                }
                var latest = await syncSupportService.getReport();
                var text = JSON.stringify(latest, null, 2);
                if (button.dataset.support === 'copy') {
                    await navigator.clipboard.writeText(text);
                    status.textContent = 'Report copied. You can paste it when asking for help.';
                } else {
                    var url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
                    var link = document.createElement('a');
                    link.href = url;
                    link.download = 'invoice-sync-report-' + new Date().toISOString().slice(0, 10) + '.json';
                    link.click();
                    setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
                    status.textContent = 'Report downloaded.';
                }
            } catch (error) {
                status.textContent = button.dataset.support === 'copy' ? 'Copy is unavailable here. Use Download report.' : 'Could not prepare the report. Please try again.';
            } finally {
                button.disabled = false;
            }
        }, "Preparing sync details"));
    });
    container.querySelectorAll('[data-retry-sync]').forEach(function(button) {
        button.addEventListener('click', withOvenLoading(async function() {
            var status = container.querySelector('[data-support-status]');
            button.disabled = true;
            try {
                await syncRecoveryService.retryItems([button.dataset.retrySync], 'manual');
                var result = await syncService.processQueue({ manual: true });
                await mountSyncSupportPanel(container);
                container.querySelector('[data-support-status]').textContent = result.message || 'Saved change queued for retry.';
            } catch (error) {
                status.textContent = error.message || 'This change could not be retried.';
            } finally {
                button.disabled = false;
            }
        }, "Preparing sync details"));
    });
}
