import { auth } from "../core/firebase.js";
import { offlineQueueService } from "./offlineQueueService.js";
import { offlineStatusService } from "./offlineStatusService.js";
import { syncService } from "./syncService.js";
import { syncRecoveryService } from './syncRecoveryService.js';

var initialized = false;
var scheduled = false;
var running = false;

async function syncReadyChanges() {
    if (running || !auth.currentUser || !offlineStatusService.isOnline()) {
        return;
    }
    running = true;
    try {
        await syncRecoveryService.recoverAuthentication().catch(function() {
            // Authentication-blocked work remains available in Conflicts.
        });
        // The queue owns retry delays and excludes conflicts and terminal errors.
        // Only wake the existing processor when work is due, avoiding a loop from
        // its own queue notifications and preserving its cross-tab sync lease.
        var items = await offlineQueueService.listProcessableItems(auth.currentUser.uid);
        var activeItems = await offlineQueueService.listActiveItems();
        var hasStaleWork = activeItems.some(function(item) {
            return item.userId === auth.currentUser.uid && item.status === 'syncing' &&
                (!item.lastAttemptAt || Date.now() - new Date(item.lastAttemptAt).getTime() > 45000);
        });
        if (items.length > 0 || hasStaleWork) {
            await syncService.processQueue();
        }
    } catch (error) {
        console.warn('Automatic sync will check again.', error);
    } finally {
        running = false;
    }
}

function scheduleAutomaticSync() {
    if (scheduled) {
        return;
    }
    scheduled = true;
    window.setTimeout(function runScheduledSync() {
        scheduled = false;
        syncReadyChanges();
    }, 250);
}

function syncWhenVisible() {
    if (document.visibilityState === 'visible') {
        scheduleAutomaticSync();
    }
}

export function initializeAutomaticSync() {
    if (initialized) {
        return;
    }
    initialized = true;
    offlineQueueService.subscribe(scheduleAutomaticSync);
    window.addEventListener('focus', scheduleAutomaticSync);
    document.addEventListener('visibilitychange', syncWhenVisible);
    // Queue notifications cover new saves. This timer wakes retries even when
    // the connection remains online and no further user action occurs.
    window.setInterval(scheduleAutomaticSync, 5000);
    scheduleAutomaticSync();
}
