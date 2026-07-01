import { getCachedRowsInfoAsync } from "../core/firestoreRead.js";
import { customerService } from "./customerService.js";
import { productService } from "./productService.js";
import { offlineQueueService } from "./offlineQueueService.js";
import { offlineStatusService } from "./offlineStatusService.js";
import { dashboardController } from "../controllers/dashboardController.js";
import { invoiceController } from "../controllers/invoiceController.js";

const DATASETS = [
    { key: 'customers:all', label: 'Customers' },
    { key: 'products:all', label: 'Products' },
    { key: 'categories:all', label: 'Product Categories' }
];

function describeFreshness(cachedAt) {
    if (!cachedAt) {
        return 'Not saved yet';
    }
    var cachedTime = new Date(cachedAt).getTime();
    if (Number.isNaN(cachedTime)) {
        return 'Saved on this device';
    }
    var ageMinutes = Math.max(0, Math.round((Date.now() - cachedTime) / 60000));
    if (ageMinutes < 1) {
        return 'Just refreshed';
    }
    if (ageMinutes < 60) {
        return ageMinutes + ' min ago';
    }
    var ageHours = Math.round(ageMinutes / 60);
    if (ageHours < 24) {
        return ageHours + ' hr ago';
    }
    return Math.round(ageHours / 24) + ' day(s) ago';
}

async function buildDatasetStatus(dataset) {
    var info = await getCachedRowsInfoAsync(dataset.key);
    return {
        key: dataset.key,
        label: dataset.label,
        count: info.count || 0,
        cachedAt: info.cachedAt || '',
        freshness: describeFreshness(info.cachedAt),
        ready: (info.count || 0) > 0
    };
}

function getSessionDatasetStatus(label, snapshot) {
    var records = snapshot && Array.isArray(snapshot.records) ? snapshot.records : [];
    var loadedAt = snapshot && snapshot.loadedAt ? new Date(snapshot.loadedAt).toISOString() : '';
    return {
        key: label.toLowerCase(),
        label: label,
        count: records.length,
        cachedAt: loadedAt,
        freshness: describeFreshness(loadedAt),
        ready: records.length > 0
    };
}

export const offlineCacheService = {
    async getStatus() {
        var queueSummary = await offlineQueueService.getSummary().catch(function() {
            return { pending: 0, retry_wait: 0, failed: 0, total: 0 };
        });
        var snapshot = offlineStatusService.getSnapshot();
        var orderSnapshot = dashboardController.getCachedDashboard();
        var invoiceSnapshot = invoiceController.getCachedInvoiceList();
        var datasets = await Promise.all(DATASETS.map(buildDatasetStatus));
        datasets.push(getSessionDatasetStatus('Orders', orderSnapshot));
        datasets.push(getSessionDatasetStatus('Invoices', invoiceSnapshot));

        return {
            online: snapshot.online === true,
            connectionMode: snapshot.connectionMode || 'offline',
            connectionReason: snapshot.connectionReason || '',
            pendingSyncCount: Number(queueSummary.pending || 0) + Number(queueSummary.retry_wait || 0),
            failedSyncCount: Number(queueSummary.failed || 0),
            datasets: datasets
        };
    },

    async refreshOfflineData() {
        if (!offlineStatusService.canAttemptCloudRead()) {
            return {
                ok: false,
                reason: 'Cannot refresh offline data because this browser reports no network connection.'
            };
        }

        var results = await Promise.allSettled([
            customerService.getAllCustomers(),
            productService.getAllProducts(),
            productService.getAllCategories(),
            dashboardController.refreshDashboard({ source: 'offline-cache-manager' }),
            invoiceController.refreshInvoiceList({ source: 'offline-cache-manager' })
        ]);
        var failed = results.filter(function(result) {
            return result.status === 'rejected';
        });

        return {
            ok: failed.length === 0,
            failedCount: failed.length,
            status: await this.getStatus()
        };
    }
};

