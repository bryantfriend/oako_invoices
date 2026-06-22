import { auth, db } from "../core/firebase.js";
import {
    doc,
    getDoc,
    serverTimestamp,
    updateDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { googleSheetsService } from "./googleSheetsService.js";
import { conflictService } from "./conflictService.js";
import { dataIntegrityService } from "./dataIntegrityService.js";
import { offlineQueueService } from "./offlineQueueService.js";
import { offlineStatusService } from "./offlineStatusService.js";

/*
 * Offline architecture:
 * Firestore persistence caches working reads, while invoice writes made offline
 * are staged in IndexedDB first. The sync queue replays those mutations in order,
 * checks updatedAt/device ownership before overwriting server data, and only runs
 * Google Sheets sync after Firestore confirms the invoice completion.
 */

function getMillis(value) {
    if (!value) {
        return 0;
    }
    if (typeof value.toMillis === 'function') {
        return value.toMillis();
    }
    if (typeof value.toDate === 'function') {
        return value.toDate().getTime();
    }
    if (value.seconds) {
        return value.seconds * 1000;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return 0;
    }
    return date.getTime();
}

function getLocalSnapshot(queueItem) {
    if (queueItem.payload && queueItem.payload.localInvoiceSnapshot) {
        return queueItem.payload.localInvoiceSnapshot;
    }
    if (queueItem.payload && queueItem.payload.invoice) {
        return queueItem.payload.invoice;
    }
    return {};
}

function buildPatch(queueItem) {
    const payload = queueItem.payload || {};
    const patch = Object.assign({}, payload.firestorePatch || {});

    if (!queueItem.userId && queueItem.actionType === 'addReturn') {
        patch.updatedAt = serverTimestamp();
        restoreDateField(patch, 'returnedAt');
        return patch;
    }

    patch.updatedAt = serverTimestamp();
    patch.localUpdatedAt = payload.localUpdatedAt || new Date().toISOString();
    patch.updatedBy = queueItem.userId || '';
    patch.deviceId = queueItem.deviceId || '';
    patch.syncState = 'synced';
    restoreDateField(patch, 'createdAt');
    restoreDateField(patch, 'dueDate');
    restoreDateField(patch, 'returnedAt');
    return patch;
}

function getQueueActor(queueItem) {
    if (!queueItem || !queueItem.userId) {
        return {
            id: 'anonymous',
            role: 'anonymous'
        };
    }

    return {
        id: queueItem.userId,
        role: 'admin'
    };
}

function getIntegrityAction(queueItem, patch) {
    if (queueItem && queueItem.actionType === 'addReturn') {
        return 'return';
    }

    if (queueItem && queueItem.actionType === 'restoreArchivedInvoice') {
        return 'restore';
    }

    if (patch && patch.status === 'archived') {
        return 'archive';
    }

    return 'update';
}

function restoreDateField(record, fieldName) {
    if (typeof record[fieldName] === 'string') {
        const date = new Date(record[fieldName]);
        if (!Number.isNaN(date.getTime())) {
            record[fieldName] = date;
        }
    }
}

function serverChangedSinceBase(queueItem, serverData) {
    const payload = queueItem.payload || {};
    if (payload.forceOverwrite === true) {
        return false;
    }

    const baseMillis = Number(payload.baseUpdatedAtMillis || 0);
    if (!baseMillis) {
        return false;
    }

    const serverMillis = getMillis(serverData.updatedAt || serverData.localUpdatedAt);
    if (!serverMillis) {
        return false;
    }

    if (serverData.deviceId && serverData.deviceId === queueItem.deviceId) {
        return false;
    }

    return serverMillis > baseMillis;
}

async function writeInvoiceCreate(queueItem) {
    const invoice = Object.assign({}, queueItem.payload.invoice || {});
    const invoiceRef = doc(db, 'invoices', queueItem.entityId);
    const serverSnap = await getDoc(invoiceRef);

    if (serverSnap.exists() && queueItem.payload.forceOverwrite !== true) {
        const localVersion = getLocalSnapshot(queueItem);
        await conflictService.saveConflict(queueItem, serverSnap.data(), localVersion);
        throw new Error('sync_conflict');
    }

    invoice.updatedAt = serverTimestamp();
    invoice.updatedBy = queueItem.userId || '';
    invoice.deviceId = queueItem.deviceId || '';
    invoice.syncState = 'synced';
    invoice.offlineCreated = false;
    restoreDateField(invoice, 'createdAt');
    restoreDateField(invoice, 'dueDate');

    await dataIntegrityService.setInvoiceWithIntegrity(invoiceRef, invoice, {
        actor: getQueueActor(queueItem),
        source: 'offline-sync',
        storeId: queueItem.storeId || '',
        companyId: queueItem.companyId || '',
        intentId: queueItem.intentId || queueItem.id || '',
        intentType: queueItem.actionType || ''
    });
}

async function writeInvoiceUpdate(queueItem) {
    const invoiceRef = doc(db, 'invoices', queueItem.entityId);

    if (!queueItem.userId && queueItem.actionType === 'addReturn') {
        await updateDoc(invoiceRef, buildPatch(queueItem));
        return;
    }

    const serverSnap = await getDoc(invoiceRef);
    const localVersion = getLocalSnapshot(queueItem);

    if (serverSnap.exists() && serverChangedSinceBase(queueItem, serverSnap.data())) {
        await conflictService.saveConflict(queueItem, serverSnap.data(), localVersion);
        throw new Error('sync_conflict');
    }

    if (!serverSnap.exists() && queueItem.actionType !== 'createInvoice') {
        await conflictService.saveConflict(queueItem, {}, localVersion);
        throw new Error('sync_conflict');
    }

    const patch = buildPatch(queueItem);
    await dataIntegrityService.updateInvoiceWithIntegrity(
        invoiceRef,
        Object.assign({ id: serverSnap.id }, serverSnap.data()),
        patch,
        {
            action: getIntegrityAction(queueItem, patch),
            actor: getQueueActor(queueItem),
            source: 'offline-sync',
            returnItems: patch.returnItems || [],
            intentId: queueItem.intentId || queueItem.id || '',
            intentType: queueItem.actionType || ''
        }
    );
}

async function syncCompletedInvoiceToSheet(queueItem) {
    const localVersion = Object.assign({}, getLocalSnapshot(queueItem));
    localVersion.status = 'fulfilled';
    localVersion.syncState = 'synced';

    const result = await googleSheetsService.syncCompletedInvoice(localVersion);
    if (result && result.success === false) {
        throw new Error(result.error && result.error.message ? result.error.message : 'Google Sheets sync failed.');
    }
}

async function processInvoiceQueueItem(queueItem) {
    if (queueItem.actionType === 'createInvoice') {
        await writeInvoiceCreate(queueItem);
        return;
    }

    await writeInvoiceUpdate(queueItem);

    if (queueItem.actionType === 'completeInvoice') {
        await syncCompletedInvoiceToSheet(queueItem);
    }
}

async function processQueueItem(queueItem) {
    if (queueItem.entityType === 'invoice') {
        await processInvoiceQueueItem(queueItem);
        return;
    }

    throw new Error('Unsupported offline queue entity: ' + queueItem.entityType);
}

export const syncService = {
    async processQueue() {
        if (!offlineStatusService.isOnline()) {
            return {
                processed: 0,
                synced: 0,
                failed: 0,
                message: 'Offline'
            };
        }

        const currentUser = auth.currentUser;
        if (!currentUser) {
            await offlineStatusService.refresh();
            return {
                processed: 0,
                synced: 0,
                failed: 0,
                message: 'Authentication required'
            };
        }

        const ownerId = 'sync-' + (currentUser.uid || 'anonymous') + '-' + Date.now();
        const leaseAcquired = await offlineQueueService.acquireSyncLease(ownerId);
        if (!leaseAcquired) {
            return {
                processed: 0,
                synced: 0,
                failed: 0,
                message: 'Another tab is synchronizing'
            };
        }

        await offlineQueueService.recoverStaleSyncingItems();

        const items = await offlineQueueService.listProcessableItems(currentUser.uid || '');
        const result = {
            processed: items.length,
            synced: 0,
            failed: 0,
            conflicts: 0
        };

        if (items.length === 0) {
            await offlineStatusService.refresh();
            await offlineQueueService.releaseSyncLease(ownerId);
            return result;
        }

        offlineStatusService.setSyncing(true);

        try {
            for (let index = 0; index < items.length; index += 1) {
                const item = items[index];
                try {
                    if (item.userId && item.userId !== (currentUser.uid || '')) {
                        await offlineQueueService.markBlockedForAuthentication(item.id);
                        result.failed += 1;
                        continue;
                    }

                    await offlineQueueService.markSyncing(item.id);
                    await processQueueItem(item);
                    await offlineQueueService.markSynced(item.id, {
                        processedAt: new Date().toISOString()
                    });
                    result.synced += 1;
                } catch (error) {
                    await offlineQueueService.markFailed(item.id, error);
                    if (String(error && error.message ? error.message : error).indexOf('sync_conflict') !== -1) {
                        result.conflicts += 1;
                    }
                    result.failed += 1;
                }
            }
        } finally {
            offlineStatusService.setSyncing(false);
            await offlineQueueService.releaseSyncLease(ownerId);
        }

        offlineStatusService.setSyncError(result.failed > 0);
        if (result.failed === 0) {
            offlineStatusService.setLastSuccessfulSyncAt(new Date().toISOString());
        }
        await offlineStatusService.refresh();
        return result;
    },

    async resolveConflict(conflictId, resolution, manualVersion) {
        const conflict = await conflictService.getConflict(conflictId);
        if (!conflict) {
            throw new Error('Conflict not found.');
        }

        const queueItem = await offlineQueueService.getQueueItem(conflict.queueItemId);
        if (!queueItem) {
            await conflictService.resolveConflict(conflictId, resolution);
            return { resolved: true };
        }

        if (resolution === 'server') {
            await offlineQueueService.markSynced(queueItem.id);
            await conflictService.resolveConflict(conflictId, resolution);
            await offlineStatusService.refresh();
            return { resolved: true };
        }

        const nextPayload = Object.assign({}, queueItem.payload || {});
        const nextLocal = resolution === 'manual' ? manualVersion : conflict.localVersion;
        nextPayload.forceOverwrite = true;
        nextPayload.localInvoiceSnapshot = nextLocal;
        nextPayload.firestorePatch = nextLocal;
        if (queueItem.actionType === 'completeInvoice' && nextPayload.firestorePatch.status === 'completed_pending_sync') {
            nextPayload.firestorePatch = Object.assign({}, nextPayload.firestorePatch, {
                status: 'fulfilled'
            });
        }

        await offlineQueueService.updateQueueItem(queueItem.id, {
            status: 'pending',
            retryCount: 0,
            lastError: '',
            payload: nextPayload
        });
        await conflictService.resolveConflict(conflictId, resolution);
        return this.processQueue();
    }
};
