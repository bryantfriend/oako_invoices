import { auth } from '../core/firebase.js';
import { offlineQueueService } from './offlineQueueService.js';
import { syncSupportService } from './syncSupportService.js';
import { offlineStatusService } from './offlineStatusService.js';
import { workflowLocalStore } from './workflowLocalStore.js';

var scheduled = false;
var initialized = false;

async function collectSyncSupport() {
    var user = auth.currentUser;
    if (!user) {
        return;
    }
    var items = await offlineQueueService.listActiveItems();
    for (var item of items) {
        if (item.userId !== user.uid || !item.lastError) {
            continue;
        }
        await syncSupportService.recordIssue(Object.assign({}, item, {
            source: 'queue', needsReview: ['blocked_authentication', 'conflict', 'failed_terminal'].indexOf(item.status) !== -1
        }), user.uid);
    }
    var report = await syncSupportService.getReport();
    for (var issue of report.issues) {
        if (issue.source !== 'queue' || issue.status === 'acknowledged') {
            continue;
        }
        var current = await offlineQueueService.getQueueItem(issue.id);
        if (current && current.userId === user.uid && current.status === 'acknowledged') {
            await syncSupportService.recordIssue(Object.assign({}, issue, { status: 'acknowledged', needsReview: false }), user.uid);
        }
    }
    if (auth.currentUser && auth.currentUser.uid === user.uid) {
        var effects = workflowLocalStore.list('effects');
        for (var effect of effects) {
            if (effect.needsReview || effect.error) {
                await syncSupportService.recordIssue({
                    source: effect.kind === 'reward' ? 'workflow' : 'sheets', id: effect.entityId, entityId: effect.entityId,
                    entityType: effect.kind === 'invoice-sheets' ? 'invoice' : 'order',
                    action: effect.action, status: effect.needsReview ? 'needs_review' : 'retry_wait', errorCode: effect.errorCode,
                    message: effect.error, attemptCount: effect.attempts, needsReview: effect.needsReview === true
                }, user.uid);
            }
        }
    }
}

function scheduleCollection() {
    if (scheduled) {
        return;
    }
    scheduled = true;
    setTimeout(async function collectQuietly() {
        try {
            await collectSyncSupport();
        } catch (error) {
            // A later queue change retries collection without interrupting staff.
        } finally {
            scheduled = false;
        }
    }, 750);
}

export function initializeSyncSupport() {
    if (initialized) {
        return;
    }
    initialized = true;
    offlineQueueService.subscribe(scheduleCollection);
    window.addEventListener('focus', scheduleCollection);
    offlineStatusService.subscribe(scheduleCollection);
    scheduleCollection();
}

export { collectSyncSupport };
