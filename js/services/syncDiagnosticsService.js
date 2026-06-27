import { APP_CONFIG } from "../config.js";
import { auth } from "../core/firebase.js";
import { offlineQueueService } from "./offlineQueueService.js";
import { offlineStatusService } from "./offlineStatusService.js";
import { offlineReadinessService } from "./offlineReadinessService.js";

function maskActorId(value) {
    var text = String(value || '');
    if (!text) {
        return 'not signed in';
    }
    if (text.length <= 8) {
        return text.charAt(0) + '***';
    }
    return text.slice(0, 4) + '...' + text.slice(-4);
}

export const syncDiagnosticsService = {
    async getDiagnostics() {
        var queueDiagnostics = await offlineQueueService.getDiagnostics();
        var snapshot = offlineStatusService.getSnapshot();
        var user = auth.currentUser;
        var offlineReadiness = await offlineReadinessService.getStatus();

        return {
            appVersion: APP_CONFIG.VERSION,
            serviceWorkerVersion: APP_CONFIG.SERVICE_WORKER_VERSION,
            dexieSchemaVersion: APP_CONFIG.DEXIE_SCHEMA_VERSION,
            online: snapshot.online,
            connectivity: snapshot.connection || {},
            browserOnline: snapshot.browserOnline === true,
            internetReachable: snapshot.internetReachable === true,
            firestoreReachable: snapshot.firestoreReachable === true,
            connectionMode: snapshot.connectionMode || '',
            connectionReason: snapshot.connectionReason || '',
            authenticatedUser: maskActorId(user && user.uid ? user.uid : ''),
            pendingIntentCount: snapshot.pendingCount,
            conflictCount: snapshot.conflictCount,
            failedIntentCount: snapshot.failedCount,
            authenticationBlockedCount: snapshot.authenticationBlockedCount,
            lastSuccessfulSynchronization: snapshot.lastSuccessfulSyncAt || '',
            updateAvailable: snapshot.updateAvailable,
            queue: queueDiagnostics,
            offlineReadiness: offlineReadiness
        };
    },

    async exportSanitizedDiagnostics() {
        var diagnostics = await this.getDiagnostics();
        return JSON.stringify(diagnostics, null, 2);
    }
};
