function getBadgeStyle(tone) {
    if (tone === 'offline') {
        return {
            background: '#fffbeb',
            color: '#92400e',
            border: '#fde68a'
        };
    }
    if (tone === 'limited') {
        return {
            background: '#fff7ed',
            color: '#9a3412',
            border: '#fed7aa'
        };
    }
    if (tone === 'pending') {
        return {
            background: '#eff6ff',
            color: '#1d4ed8',
            border: '#bfdbfe'
        };
    }
    if (tone === 'syncing') {
        return {
            background: '#ecfdf5',
            color: '#047857',
            border: '#a7f3d0'
        };
    }
    if (tone === 'error') {
        return {
            background: '#fef2f2',
            color: '#b91c1c',
            border: '#fecaca'
        };
    }
    if (tone === 'update') {
        return {
            background: '#eef2ff',
            color: '#3730a3',
            border: '#c7d2fe'
        };
    }
    return {
        background: '#f0fdf4',
        color: '#166534',
        border: '#bbf7d0'
    };
}

export function renderSyncStatusBadge(snapshot) {
    const safeSnapshot = snapshot || {};
    const style = getBadgeStyle(safeSnapshot.tone || 'online');
    const detail = safeSnapshot.pendingCount > 0
        ? ' · ' + safeSnapshot.pendingCount + ' pending'
        : (safeSnapshot.conflictCount > 0 ? ' · ' + safeSnapshot.conflictCount + ' conflict' : (safeSnapshot.failedCount > 0 ? ' · ' + safeSnapshot.failedCount + ' failed' : ''));

    return `
        <div class="sync-status-badge" style="
            display: inline-flex;
            align-items: center;
            gap: 8px;
            border: 1px solid ${style.border};
            background: ${style.background};
            color: ${style.color};
            border-radius: 999px;
            padding: 4px 6px 4px 10px;
            font-size: 11px;
            font-weight: 900;
            white-space: nowrap;
        ">
            <span>${safeSnapshot.label || 'Online'}${detail}</span>
            <button id="sync-details-btn" type="button" class="btn btn-secondary btn-sm" style="
                font-size: 10px;
                padding: 3px 8px;
                border-radius: 999px;
                background: white;
            ">Details</button>
            <button id="sync-now-btn" type="button" class="btn btn-secondary btn-sm" style="
                font-size: 10px;
                padding: 3px 8px;
                border-radius: 999px;
                background: white;
            ">Sync Now</button>
        </div>
    `;
}

export function renderInvoiceSyncPill(invoice) {
    const state = invoice && invoice.syncState ? invoice.syncState : 'synced';
    const labels = {
        synced: 'synced',
        pending_sync: 'pending sync',
        offline_created: 'offline created',
        sync_failed: 'sync failed',
        sync_conflict: 'conflict',
        saved_local: 'saved on device'
    };
    const tones = {
        synced: getBadgeStyle('online'),
        pending_sync: getBadgeStyle('pending'),
        offline_created: getBadgeStyle('offline'),
        sync_failed: getBadgeStyle('error'),
        sync_conflict: getBadgeStyle('error')
    };
    const style = tones[state] || tones.synced;

    return `
        <span style="
            display: inline-flex;
            align-items: center;
            border: 1px solid ${style.border};
            background: ${style.background};
            color: ${style.color};
            border-radius: 999px;
            padding: 3px 8px;
            font-size: 10px;
            font-weight: 900;
            text-transform: uppercase;
            white-space: nowrap;
        ">${labels[state] || state}</span>
    `;
}
