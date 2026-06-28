import { auth, db } from "../core/firebase.js";
import {
    doc,
    getDoc,
    setDoc,
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


function getLocalOrderSnapshot(queueItem) {
    if (queueItem.payload && queueItem.payload.localOrderSnapshot) {
        return queueItem.payload.localOrderSnapshot;
    }
    if (queueItem.payload && queueItem.payload.order) {
        return queueItem.payload.order;
    }
    return {};
}

function prepareOrderForSync(queueItem) {
    const order = Object.assign({}, getLocalOrderSnapshot(queueItem));
    delete order.id;
    order.updatedAt = serverTimestamp();
    order.createdAt = order.createdAt || serverTimestamp();
    restoreDateField(order, 'createdAt');
    restoreDateField(order, 'updatedAt');
    order.localUpdatedAt = order.localUpdatedAt || new Date().toISOString();
    order.syncState = 'synced';
    order.syncStatus = 'synced';
    order.syncAction = '';
    order.serverId = queueItem.entityId;
    order.lastSyncAttemptAt = new Date().toISOString();
    order.syncError = null;
    order.createdOffline = false;
    order.offlineCreated = false;
    return order;
}

async function writeOrderCreate(queueItem) {
    const orderRef = doc(db, 'orders', queueItem.entityId);
    const serverSnap = await getDoc(orderRef);
    const localVersion = getLocalOrderSnapshot(queueItem);

    if (serverSnap.exists() && queueItem.payload && queueItem.payload.forceOverwrite !== true) {
        await conflictService.saveConflict(queueItem, serverSnap.data(), localVersion);
        throw new Error('sync_conflict');
    }

    const order = prepareOrderForSync(queueItem);
    await setDoc(orderRef, order, { merge: true });
    await googleSheetsService.syncOrderLifecycle(Object.assign({ id: queueItem.entityId }, localVersion, order)).catch(function(error) {
        console.warn('Google Sheets order sync failed after offline order create.', error);
    });
}

function prepareOrderPatchForSync(queueItem) {
    const payload = queueItem.payload || {};
    const patch = Object.assign({}, payload.firestorePatch || {});
    patch.updatedAt = serverTimestamp();
    patch.localUpdatedAt = payload.localUpdatedAt || new Date().toISOString();
    patch.updatedBy = queueItem.userId || patch.archivedBy || '';
    patch.deviceId = queueItem.deviceId || '';
    patch.syncState = 'synced';
    patch.syncStatus = 'synced';
    patch.syncAction = '';
    patch.syncError = null;
    patch.lastSyncAttemptAt = new Date().toISOString();
    restoreDateField(patch, 'archivedAt');
    return patch;
}

async function writeOrderArchive(queueItem) {
    const orderRef = doc(db, 'orders', queueItem.entityId);
    const localVersion = getLocalOrderSnapshot(queueItem);
    const patch = prepareOrderPatchForSync(queueItem);
    await updateDoc(orderRef, patch);
    await googleSheetsService.syncOrderLifecycle(Object.assign({ id: queueItem.entityId }, localVersion, patch)).catch(function(error) {
        console.warn('Google Sheets order sync failed after offline order archive.', error);
    });
}

async function processOrderQueueItem(queueItem) {
    if (queueItem.actionType === 'createOrder') {
        await writeOrderCreate(queueItem);
        return;
    }

    if (queueItem.actionType === 'archiveOrder') {
        await writeOrderArchive(queueItem);
        return;
    }

    throw new Error('Unsupported offline order action: ' + queueItem.actionType);
}
async function processQueueItem(queueItem) {
    if (queueItem.entityType === 'invoice') {
        await processInvoiceQueueItem(queueItem);
        return;
    }

    if (queueItem.entityType === 'order') {
        await processOrderQueueItem(queueItem);
        return;
    }

    throw new Error('Unsupported offline queue entity: ' + queueItem.entityType);
}

export const syncService = {
    async processQueue(options) {
        const safeOptions = options || {};
        const manual = safeOptions.manual === true;
        let snapshot = offlineStatusService.getSnapshot();

        if (manual) {
            console.info('[SYNC_NOW] clicked', { pending: snapshot.pendingCount, failed: snapshot.failedCount });
            await offlineStatusService.refresh();
            snapshot = offlineStatusService.getSnapshot();
            console.info('[SYNC_NOW] reachability', {
                online: snapshot.online,
                browserOnline: snapshot.browserOnline,
                internetReachable: snapshot.internetReachable,
                firestoreReachable: snapshot.firestoreReachable,
                connectionMode: snapshot.connectionMode
            });
        }

        if (!offlineStatusService.isOnline()) {
            const offlineResult = {
                processed: 0,
                synced: 0,
                failed: 0,
                failureReason: 'firestore_unreachable',
                message: 'Cannot reach Firestore yet. Your ' + (snapshot.pendingCount || 0) + ' changes are still saved locally.'
            };
            if (manual) {
                console.warn('[SYNC_NOW] stopped', offlineResult);
            }
            return offlineResult;
        }

        const currentUser = auth.currentUser;
        if (!currentUser) {
            await offlineStatusService.refresh();
            const authResult = {
                processed: 0,
                synced: 0,
                failed: 0,
                failureReason: 'authentication_required',
                message: 'Cannot sync yet because login/auth is not ready.'
            };
            if (manual) {
                console.warn('[SYNC_NOW] stopped', authResult);
            }
            return authResult;
        }

        const ownerId = 'sync-' + (currentUser.uid || 'anonymous') + '-' + Date.now();
        const leaseAcquired = await offlineQueueService.acquireSyncLease(ownerId);
        if (!leaseAcquired) {
            const leaseResult = {
                processed: 0,
                synced: 0,
                failed: 0,
                failureReason: 'sync_lease_busy',
                message: 'Another tab is synchronizing'
            };
            if (manual) {
                console.info('[SYNC_NOW] stopped', leaseResult);
            }
            return leaseResult;
        }

        await offlineQueueService.recoverStaleSyncingItems();

        const items = await offlineQueueService.listProcessableItems(currentUser.uid || '', {
            includeRetryWait: manual
        });
        const result = {
            processed: items.length,
            synced: 0,
            failed: 0,
            conflicts: 0,
            failureReason: '',
            message: ''
        };

        if (manual) {
            console.info('[SYNC_NOW] queueProcessorStarted: true', { processable: items.length });
        }

        if (items.length === 0) {
            await offlineStatusService.refresh();
            await offlineQueueService.releaseSyncLease(ownerId);
            if (manual) {
                console.info('[SYNC_NOW] complete', result);
            }
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
                        result.failureReason = result.failureReason || 'authentication_required';
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
                    const message = String(error && error.message ? error.message : error);
                    if (message.indexOf('sync_conflict') !== -1) {
                        result.conflicts += 1;
                        result.failureReason = result.failureReason || 'sync_conflict';
                    } else if (message.indexOf('permission') !== -1 || message.indexOf('PERMISSION_DENIED') !== -1) {
                        result.failureReason = result.failureReason || 'security_rules_or_auth';
                    } else if (message.indexOf('invalid') !== -1 || message.indexOf('payload') !== -1) {
                        result.failureReason = result.failureReason || 'payload_error';
                    } else {
                        result.failureReason = result.failureReason || 'sync_write_failed';
                    }
                    result.failed += 1;
                    if (manual) {
                        console.warn('[SYNC_NOW] item failed', {
                            id: item.id,
                            actionType: item.actionType,
                            entityType: item.entityType,
                            entityId: item.entityId,
                            error: message
                        });
                    }
                }
            }
        } finally {
            offlineStatusService.setSyncing(false);
            await offlineQueueService.releaseSyncLease(ownerId);
        }

        offlineStatusService.setSyncError(result.failed > 0);
        if (result.failed === 0) {
            offlineStatusService.setLastSuccessfulSyncAt(new Date().toISOString());
            result.message = 'Sync complete: ' + result.synced + ' synced, 0 failed.';
        } else {
            result.message = 'Sync finished with ' + result.failed + ' failed item' + (result.failed === 1 ? '' : 's') + '. Pending changes were kept.';
        }
        await offlineStatusService.refresh();
        if (manual) {
            console.info('[SYNC_NOW] complete', result);
        }
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
        if (queueItem.entityType === 'order') {
            nextPayload.localOrderSnapshot = nextLocal;
            nextPayload.order = nextLocal;
        } else {
            nextPayload.localInvoiceSnapshot = nextLocal;
            nextPayload.firestorePatch = nextLocal;
        }
        if (queueItem.actionType === 'completeInvoice' && nextPayload.firestorePatch && nextPayload.firestorePatch.status === 'completed_pending_sync') {
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
