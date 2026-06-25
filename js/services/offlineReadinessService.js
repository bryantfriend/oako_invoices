import { getCachedRowsInfo } from "../core/firestoreRead.js";
import { openOfflineDexieDatabase } from "./offlineDexieDb.js";
import { offlineQueueService } from "./offlineQueueService.js";
import { conflictService } from "./conflictService.js";

function safeDate(value) {
    if (!value) {
        return '';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '';
    }
    return date.toISOString();
}

function formatAge(cachedAt) {
    const date = new Date(cachedAt || '');
    if (Number.isNaN(date.getTime())) {
        return 'Never cached';
    }
    const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return minutes + ' min ago';
    const hours = Math.round(minutes / 60);
    if (hours < 48) return hours + ' hr ago';
    return Math.round(hours / 24) + ' days ago';
}

async function getSessionCacheInfo(collectionName) {
    try {
        const database = await openOfflineDexieDatabase();
        if (!database.sessionRecords) {
            return { count: 0, cachedAt: '' };
        }
        const records = await database.sessionRecords
            .where('collectionName')
            .equals(collectionName)
            .toArray();
        if (!records.length) {
            return { count: 0, cachedAt: '' };
        }
        records.sort((a, b) => String(b.loadedAt || '').localeCompare(String(a.loadedAt || '')));
        const latest = records[0];
        let rows = [];
        try {
            rows = JSON.parse(latest.rowsJson || '[]');
        } catch (_) {
            rows = [];
        }
        return {
            count: Array.isArray(rows) ? rows.length : 0,
            cachedAt: latest.loadedAt ? safeDate(latest.loadedAt) : ''
        };
    } catch (error) {
        return { count: 0, cachedAt: '', error: error && error.message ? error.message : 'Cache unavailable' };
    }
}

async function getServiceWorkerInfo() {
    if (typeof navigator === 'undefined' || !navigator.serviceWorker) {
        return { ready: false, controlled: false, cacheCount: 0 };
    }

    let controlled = Boolean(navigator.serviceWorker.controller);
    let cacheCount = 0;
    try {
        if (typeof caches !== 'undefined') {
            const cacheNames = await caches.keys();
            cacheCount = cacheNames.filter(name => name.indexOf('oako') !== -1 || name.indexOf('workbox-precache') !== -1).length;
        }
    } catch (_) {
        cacheCount = 0;
    }

    return {
        ready: controlled && cacheCount > 0,
        controlled,
        cacheCount
    };
}

function buildDataset(key, label, info, required) {
    const count = Number(info.count || 0);
    const ready = required ? count > 0 : true;
    return {
        key,
        label,
        count,
        cachedAt: info.cachedAt || '',
        ageLabel: formatAge(info.cachedAt),
        required: required === true,
        ready,
        error: info.error || ''
    };
}

export const offlineReadinessService = {
    async getStatus() {
        const products = getCachedRowsInfo('products:all');
        const categories = getCachedRowsInfo('categories:all');
        const customers = getCachedRowsInfo('customers:all');
        const settings = getCachedRowsInfo('settings:invoice_config');
        const [orders, invoices, queueSummary, conflicts, serviceWorker] = await Promise.all([
            getSessionCacheInfo('orders'),
            getSessionCacheInfo('invoices'),
            offlineQueueService.getSummary().catch(() => ({ pending: 0, retry_wait: 0, conflict: 0, failed: 0, failed_terminal: 0 })),
            conflictService.getOpenConflicts().catch(() => []),
            getServiceWorkerInfo()
        ]);

        const datasets = [
            buildDataset('orders', 'Orders', orders, true),
            buildDataset('products', 'Products', products, true),
            buildDataset('categories', 'Categories', categories, false),
            buildDataset('customers', 'Customers', customers, false),
            buildDataset('settings', 'Invoice settings', settings, true),
            buildDataset('invoices', 'Invoices', invoices, false)
        ];

        const requiredReady = datasets.filter(item => item.required).every(item => item.ready);
        const ready = requiredReady && serviceWorker.ready;
        return {
            ready,
            label: ready ? 'Ready for offline work' : 'Offline setup needs attention',
            serviceWorker,
            datasets,
            queue: queueSummary,
            openConflicts: conflicts.length,
            checkedAt: new Date().toISOString()
        };
    },

    formatAge
};
