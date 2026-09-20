import { auth } from '../core/firebase.js';
import { APP_CONFIG } from '../config.js';
import { openOfflineDexieDatabase } from './offlineDexieDb.js';

var storageUnavailable = false;

function cleanText(value) {
    return String(value || '')
        .replace(/https?:\/\/[^\s<>]+/gi, '[URL removed]')
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email removed]')
        .replace(/\bBearer\s+\S+/gi, 'Bearer [removed]')
        .replace(/\beyJ[A-Za-z0-9_.-]+/g, '[token removed]')
        .replace(/((?:secureToken|token|password|secret|apiKey|pinCode)["']?\s*[=:]\s*["']?)[^\s,;"'}]+/gi, '$1[removed]')
        .slice(0, 700);
}

function ownerId() {
    return auth.currentUser ? auth.currentUser.uid : '';
}

function supportKey(actorId) {
    return 'sync-support:' + actorId;
}

async function recordIssue(details, actorId) {
    actorId = actorId || ownerId();
    if (!actorId) {
        return;
    }
    try {
        var database = await openOfflineDexieDatabase();
        await database.transaction('rw', database.syncMetadata, async function() {
            var key = supportKey(actorId);
            var saved = await database.syncMetadata.get(key);
            var now = new Date().toISOString();
            var cutoff = Date.now() - 30 * 86400000;
            var rows = saved && Array.isArray(saved.rows) ? saved.rows.filter(function(row) {
                return new Date(row.lastSeenAt).getTime() >= cutoff;
            }) : [];
            var identity = String(details.source || 'queue') + ':' + String(details.id || details.entityId || 'configuration');
            var existing = rows.find(function(row) { return row.key === identity; });
            var row = {
                key: identity, source: cleanText(details.source || 'queue'),
                id: cleanText(details.id), entityId: cleanText(details.entityId),
                entityType: cleanText(details.entityType), action: cleanText(details.action || details.actionType),
                status: cleanText(details.status), errorCode: cleanText(details.errorCode || details.lastErrorCode),
                message: cleanText(details.message || details.lastErrorMessage || details.lastError),
                attemptCount: Number(details.attemptCount || details.retryCount || 0),
                createdAt: cleanText(details.createdAt || details.createdAtLocal),
                payloadFields: details.payload && typeof details.payload === 'object' ? Object.keys(details.payload).map(cleanText).sort() : (existing ? existing.payloadFields : []),
                nextAttemptAt: cleanText(details.nextAttemptAt), lastAttemptAt: cleanText(details.lastAttemptAt),
                firstSeenAt: existing ? existing.firstSeenAt : now, lastSeenAt: now,
                appVersion: APP_CONFIG.VERSION, needsReview: details.needsReview !== false,
                browserOnline: typeof navigator !== 'undefined' ? navigator.onLine !== false : null
            };
            // Keep a bounded history of changes, without copying invoice payloads.
            row.history = existing && Array.isArray(existing.history) ? existing.history : [];
            if (!existing || existing.status !== row.status || existing.errorCode !== row.errorCode || existing.attemptCount !== row.attemptCount) {
                row.history = row.history.concat([{ at: now, status: row.status, code: row.errorCode, attempts: row.attemptCount }]).slice(-12);
            }
            rows = rows.filter(function(item) { return item.key !== identity; });
            rows.push(row);
            await database.syncMetadata.put({ key: key, rows: rows.slice(-200) });
        });
        storageUnavailable = false;
    } catch (error) {
        // Diagnostics must never block saving, syncing, or invoice printing.
        storageUnavailable = true;
    }
}

async function getReport() {
    var actorId = ownerId();
    var rows = [];
    var connection = {};
    if (actorId) {
        try {
            var database = await openOfflineDexieDatabase();
            var saved = await database.syncMetadata.get(supportKey(actorId));
            rows = saved && Array.isArray(saved.rows) ? saved.rows : [];
        } catch (error) {
            storageUnavailable = true;
        }
    }
    try {
        var statusModule = await import('./offlineStatusService.js');
        var snapshot = statusModule.offlineStatusService.getSnapshot();
        connection = {
            mode: snapshot.connectionMode || '', browserOnline: snapshot.browserOnline === true,
            internetReachable: snapshot.internetReachable === true, firestoreReachable: snapshot.firestoreReachable === true,
            lastSuccessfulSyncAt: snapshot.lastSuccessfulSyncAt || ''
        };
    } catch (error) {
        // Queue history remains exportable even when connection diagnostics fail.
    }
    if (actorId !== ownerId()) {
        rows = [];
    }
    return {
        reportVersion: 1, generatedAt: new Date().toISOString(),
        appVersion: APP_CONFIG.VERSION, serviceWorkerVersion: APP_CONFIG.SERVICE_WORKER_VERSION,
        browserOnline: typeof navigator !== 'undefined' ? navigator.onLine !== false : null,
        storageUnavailable: storageUnavailable,
        connection: connection,
        retention: 'Up to 200 issues, collected for 30 days on this browser for the signed-in account.',
        issues: rows.filter(function(row) { return new Date(row.lastSeenAt).getTime() >= Date.now() - 30 * 86400000; })
    };
}

export const syncSupportService = { recordIssue: recordIssue, getReport: getReport, cleanText: cleanText };
