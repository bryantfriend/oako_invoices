import { layoutView } from "./layoutView.js";
import { conflictService } from "../services/conflictService.js";
import { syncService } from "../services/syncService.js";
import { notificationService } from "../core/notificationService.js";

function escapeHtml(value = '') {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function summarizeVersion(version = {}) {
    const source = version || {};
    return JSON.stringify({
        id: source.id || '',
        invoiceNumber: source.invoiceNumber || '',
        customerName: source.customerName || '',
        status: source.status || '',
        totalAmount: source.totalAmount || 0,
        updatedAt: source.updatedAt || source.localUpdatedAt || ''
    }, null, 2);
}

function renderConflictCard(conflict) {
    const title = conflict.entityType === 'invoice'
        ? (conflict.localVersion?.invoiceNumber || conflict.serverVersion?.invoiceNumber || conflict.entityId)
        : conflict.entityId;
    return `
        <article class="card" style="margin: 0; border-color: #fecaca; display: grid; gap: 12px;">
            <div style="display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; flex-wrap: wrap;">
                <div>
                    <h2 style="font-size: 16px; font-weight: 900; color: #991b1b; margin: 0;">${escapeHtml(title)}</h2>
                    <div style="font-size: 12px; color: var(--color-gray-500);">${escapeHtml(conflict.entityType)} · ${escapeHtml(conflict.actionType)} · ${escapeHtml(conflict.createdAtLocal || '')}</div>
                </div>
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                    <button class="btn btn-secondary btn-sm conflict-resolve" data-id="${escapeHtml(conflict.id)}" data-resolution="server">Use Server</button>
                    <button class="btn btn-primary btn-sm conflict-resolve" data-id="${escapeHtml(conflict.id)}" data-resolution="local">Use Offline</button>
                    <button class="btn btn-secondary btn-sm conflict-resolve" data-id="${escapeHtml(conflict.id)}" data-resolution="manual">Manual</button>
                </div>
            </div>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px;">
                <div>
                    <strong style="font-size: 12px; color: var(--color-gray-700);">Server version</strong>
                    <pre style="white-space: pre-wrap; margin-top: 6px; background: var(--color-gray-50); border: 1px solid var(--color-gray-200); border-radius: 8px; padding: 10px; font-size: 11px; max-height: 220px; overflow: auto;">${escapeHtml(summarizeVersion(conflict.serverVersion))}</pre>
                </div>
                <div>
                    <strong style="font-size: 12px; color: var(--color-gray-700);">Offline version</strong>
                    <pre style="white-space: pre-wrap; margin-top: 6px; background: var(--color-gray-50); border: 1px solid var(--color-gray-200); border-radius: 8px; padding: 10px; font-size: 11px; max-height: 220px; overflow: auto;">${escapeHtml(summarizeVersion(conflict.localVersion))}</pre>
                </div>
            </div>
        </article>
    `;
}

export async function renderConflictReview() {
    layoutView.render();
    layoutView.updateTitle('Sync Conflicts');

    const container = document.getElementById('page-container');
    const conflicts = await conflictService.getOpenConflicts();

    container.innerHTML = `
        <div class="animate-fade-in" style="display: grid; gap: 16px; max-width: 1200px; margin: 0 auto;">
            <div style="display: flex; justify-content: space-between; gap: 12px; align-items: center; flex-wrap: wrap;">
                <div>
                    <h1 style="font-size: 24px; font-weight: 900; margin: 0;">Sync Conflicts</h1>
                    <p style="font-size: 13px; color: var(--color-gray-500); margin-top: 4px;">Review records that changed both offline and online before syncing.</p>
                </div>
                <button id="conflicts-sync-now" class="btn btn-secondary">Sync Now</button>
            </div>
            ${conflicts.length ? conflicts.map(renderConflictCard).join('') : '<div class="card" style="text-align: center; color: var(--color-gray-500);">No open conflicts.</div>'}
        </div>
    `;

    document.getElementById('conflicts-sync-now')?.addEventListener('click', async function() {
        const result = await syncService.processQueue();
        notificationService.info('Sync complete: ' + result.synced + ' synced, ' + result.failed + ' failed.');
        renderConflictReview();
    });

    container.querySelectorAll('.conflict-resolve').forEach(button => {
        button.addEventListener('click', async function() {
            const id = button.dataset.id;
            const resolution = button.dataset.resolution;
            const conflict = await conflictService.getConflict(id);
            let manualVersion = null;
            if (resolution === 'manual') {
                const edited = prompt('Edit the offline JSON before syncing:', JSON.stringify(conflict.localVersion || {}, null, 2));
                if (!edited) return;
                manualVersion = JSON.parse(edited);
            }
            await syncService.resolveConflict(id, resolution, manualVersion);
            notificationService.success('Conflict resolved.');
            renderConflictReview();
        });
    });
}
