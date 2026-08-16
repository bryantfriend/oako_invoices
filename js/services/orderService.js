import { auth, db } from "../core/firebase.js";
import {
    collection,
    addDoc,
    getDoc,
    getDocFromCache,
    doc,
    updateDoc,
    query,
    orderBy,
    where,
    limit,
    serverTimestamp,
    runTransaction
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { ORDER_STATUS } from "../core/constants.js";
import { googleSheetsService } from "./googleSheetsService.js";
import { dataIntegrityService } from "./dataIntegrityService.js";
import { createCollectionTimeoutError, logCollectionError } from "../core/firestoreDiagnostics.js";
import { getDocsWithCache } from "../core/firestoreRead.js";
import { offlineStatusService } from "./offlineStatusService.js";
import { offlineQueueService } from "./offlineQueueService.js";
import { deviceIdService } from "./deviceIdService.js";
import { store } from "../core/store.js";
import icfPipeline from "../ICF/engine/pipeline.js";
import updateOrderStatusIntentModule from "../ICF/Intents/UpdateOrderStatusIntent.js";
import archiveSelectedOrdersIntentModule from "../ICF/Intents/ArchiveSelectedOrdersIntent.js";
import { normalizeArchivedRecord } from "../core/archiveRecordHelpers.js";

const COLLECTION = 'orders';
const LEGACY_ARCHIVE_COLLECTION = 'orders_archive';

function getCurrentUserId() {
    return auth.currentUser && auth.currentUser.uid ? auth.currentUser.uid : '';
}

function getCurrentActor() {
    const state = store.getState ? store.getState() : {};
    const user = auth.currentUser || state.currentUser || null;
    const profile = state.adminProfile || {};
    const isAdmin = !!state.isAdmin;

    if (!user && !isAdmin) {
        return {
            id: 'anonymous',
            role: 'anonymous'
        };
    }

    return {
        id: (user && (user.email || user.uid)) || 'admin',
        role: profile.role || ((isAdmin || user) ? 'admin' : 'anonymous')
    };
}

function getPipelineErrorMessage(result) {
    if (!result) {
        return 'Unknown pipeline failure.';
    }

    if (Array.isArray(result.errors) && result.errors.length > 0) {
        return result.errors.join(' ');
    }

    if (result.reason) {
        return result.reason;
    }

    return 'Unknown pipeline failure.';
}

function isPendingLocalCreate(order) {
    return !!(order
        && (order.syncAction === 'create' || order.syncState === 'offline_created' || order.syncStatus === 'pending')
        && !order.serverId);
}

function mergeLocalOrders(serverOrders, localOrdersById) {
    const byId = {};
    (serverOrders || []).forEach(order => {
        if (order && order.id) {
            byId[order.id] = order;
        }
    });
    Object.keys(localOrdersById || {}).forEach(id => {
        byId[id] = Object.assign({}, byId[id] || {}, localOrdersById[id], { id });
    });
    return Object.keys(byId).map(id => normalizeArchivedRecord(byId[id], ORDER_STATUS.DRAFT));
}

function getMillis(value) {
    if (!value) return 0;
    if (typeof value.toMillis === 'function') return value.toMillis();
    if (typeof value.toDate === 'function') return value.toDate().getTime();
    if (value.seconds) return Number(value.seconds) * 1000;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

async function runBulkOrderTransition(ids, transition, onProgress) {
    const orderIds = Array.from(new Set((ids || []).map(id => String(id || '').trim()).filter(Boolean)));
    const succeeded = [];
    const failures = [];
    let nextIndex = 0;
    let completed = 0;

    async function worker() {
        while (nextIndex < orderIds.length) {
            const index = nextIndex++;
            const orderId = orderIds[index];
            let result = null;
            let error = null;
            for (let attempt = 0; attempt < 2 && !result; attempt += 1) {
                try {
                    result = await transition(orderId);
                } catch (transitionError) {
                    error = transitionError;
                }
            }
            if (result) succeeded.push({ orderId: orderId, result: result });
            else failures.push({ orderId: orderId, message: error && error.message ? error.message : 'Transition failed.' });
            completed += 1;
            if (typeof onProgress === 'function') {
                onProgress({
                    orderId: orderId,
                    ok: Boolean(result),
                    result: result,
                    completed: completed,
                    succeeded: succeeded.length,
                    failed: failures.length,
                    total: orderIds.length,
                    percent: orderIds.length ? Math.round((completed / orderIds.length) * 100) : 100
                });
            }
        }
    }

    await Promise.all(Array.from({ length: Math.min(3, orderIds.length) }, worker));
    return {
        requested: orderIds.length,
        succeeded: succeeded,
        failures: failures,
        transitioned: succeeded.filter(entry => entry.result && entry.result.transitioned !== false).length,
        skipped: succeeded.filter(entry => entry.result && entry.result.transitioned === false).length,
        failed: failures.length,
        complete: failures.length === 0
    };
}

function mergeLegacyArchivedOrders(activeOrders, legacyArchivedOrders) {
    var byId = {};
    (activeOrders || []).forEach(function(order) {
        if (order && order.id) {
            byId[order.id] = order;
        }
    });
    (legacyArchivedOrders || []).forEach(function(order) {
        if (!order || !order.id || byId[order.id]) {
            return;
        }
        var storedStatus = String(order.status || '').toLowerCase();
        byId[order.id] = Object.assign({}, order, {
            archived: true,
            status: order.previousStatus || (storedStatus !== 'archived' ? storedStatus : ORDER_STATUS.DRAFT)
        });
    });
    return Object.keys(byId).map(function(id) { return byId[id]; });
}

async function getLocalOrderSnapshot(id) {
    const snapshots = await offlineQueueService.getLocalEntitySnapshots('order').catch(function() {
        return {};
    });
    return snapshots[id] || null;
}
function buildOrderAuditDetails(order) {
    var source = order || {};
    return {
        customerName: source.customerName || '',
        status: source.status || '',
        totalAmount: source.totalAmount || 0
    };
}

export const orderService = {
    async getAllOrders() {
        try {
            const q = query(collection(db, COLLECTION), orderBy('createdAt', 'desc'));
            const legacyArchiveQuery = query(collection(db, LEGACY_ARCHIVE_COLLECTION));
            const groups = await Promise.all([
                getDocsWithCache(q, {
                    collectionName: COLLECTION,
                    cacheKey: 'orders:all:createdAt_desc',
                    timeoutMs: 45000,
                    attempts: 2
                }),
                getDocsWithCache(legacyArchiveQuery, {
                    collectionName: LEGACY_ARCHIVE_COLLECTION,
                    cacheKey: 'orders_archive:all',
                    timeoutMs: 45000,
                    attempts: 2
                }).catch(function(error) {
                    console.warn('Legacy archived orders could not be loaded; current orders remain available.', error);
                    return [];
                })
            ]);
            const rows = mergeLegacyArchivedOrders(groups[0] || [], groups[1] || []);
            return mergeLocalOrders(rows, await offlineQueueService.getLocalEntitySnapshots('order'));
        } catch (error) {
            logCollectionError(COLLECTION, error);
            throw error;
        }
    },

    async getOrderById(id) {
        let timeoutId;
        try {
            const docRef = doc(db, COLLECTION, id);
            const localOrder = await getLocalOrderSnapshot(id);
            if (!offlineStatusService.canAttemptCloudRead() && localOrder) {
                return normalizeArchivedRecord(localOrder, ORDER_STATUS.DRAFT);
            }

            if (offlineStatusService.canAttemptCloudRead()) {
                try {
                    const timeoutPromise = new Promise(function(resolve, reject) {
                        timeoutId = setTimeout(function() {
                            reject(createCollectionTimeoutError(COLLECTION, 30000));
                        }, 30000);
                    });
                    const serverSnapshot = await Promise.race([getDoc(docRef), timeoutPromise]);
                    if (serverSnapshot.exists()) {
                        return normalizeArchivedRecord(Object.assign({ id: serverSnapshot.id }, serverSnapshot.data(), localOrder || {}), ORDER_STATUS.DRAFT);
                    }
                    return normalizeArchivedRecord(localOrder, ORDER_STATUS.DRAFT);
                } catch (serverError) {
                    console.warn("Could not load server order; checking offline document cache.", serverError);
                }
            }

            try {
                const cachedSnapshot = await getDocFromCache(docRef);
                if (cachedSnapshot.exists()) {
                    return normalizeArchivedRecord(Object.assign({ id: cachedSnapshot.id }, cachedSnapshot.data(), localOrder || {}), ORDER_STATUS.DRAFT);
                }
            } catch (cacheError) {
                if (!localOrder) {
                    console.warn("Order was not available in the offline document cache.", cacheError);
                }
            }
            return normalizeArchivedRecord(localOrder, ORDER_STATUS.DRAFT);
        } catch (error) {
            console.error("Error fetching order:", error);
            throw error;
        } finally {
            clearTimeout(timeoutId);
        }
    },

    async getLastOrderByCustomer(customerName) {
        try {
            // Assumes exact string match for now. Ideally use customerId if fully relational.
            const q = query(
                collection(db, COLLECTION),
                where('customerName', '==', customerName)
            );
            const docs = await getDocsWithCache(q, {
                collectionName: COLLECTION,
                cacheKey: `orders:last:${customerName}`,
                timeoutMs: 45000,
                attempts: 2
            });
            if (docs.length) {
                // Sort by createdAt descending in memory to avoid needing a composite index
                docs.sort((a, b) => {
                    const dateA = a.createdAt?.seconds || 0;
                    const dateB = b.createdAt?.seconds || 0;
                    return dateB - dateA;
                });
                return normalizeArchivedRecord(docs[0], ORDER_STATUS.DRAFT);
            }
            return null;
        } catch (error) {
            console.error("Error fetching last order:", error);
            // Don't throw, just return null to not break flow
            return null;
        }
    },

    async getOrdersByCustomerName(customerName) {
        try {
            const q = query(
                collection(db, COLLECTION),
                where('customerName', '==', customerName)
            );
            const docs = await getDocsWithCache(q, {
                collectionName: COLLECTION,
                cacheKey: `orders:customer:${customerName}`,
                timeoutMs: 45000,
                attempts: 2
            });

            // Sort in memory to avoid index requirements for now
            return docs.map(order => normalizeArchivedRecord(order, ORDER_STATUS.DRAFT)).sort((a, b) => {
                const dateA = a.createdAt?.seconds || 0;
                const dateB = b.createdAt?.seconds || 0;
                return dateB - dateA;
            });
        } catch (error) {
            console.error("Error fetching customer orders:", error);
            return [];
        }
    },

    async createOrder(orderData, userId) {
        try {
            const now = new Date();
            const isOffline = !offlineStatusService.isOnline();
            const offlineOrderId = isOffline ? await deviceIdService.createOfflineEntityId('KORG') : '';
            const payload = {
                ...orderData,
                id: offlineOrderId,
                status: ORDER_STATUS.DRAFT,
                archived: false,
                createdBy: userId,
                createdAt: isOffline ? now : serverTimestamp(),
                updatedAt: isOffline ? now : serverTimestamp(),
                localId: isOffline ? offlineOrderId : '',
                serverId: isOffline ? null : '',
                syncStatus: isOffline ? 'pending' : 'synced',
                syncAction: isOffline ? 'create' : '',
                createdOffline: isOffline,
                localCreatedAt: now.getTime(),
                localUpdatedAt: now.toISOString(),
                localUpdatedAtMillis: now.getTime(),
                lastSyncAttemptAt: null,
                syncError: null,
                syncState: isOffline ? 'offline_created' : 'synced',
                offlineCreated: isOffline,
                invoiceGenerated: false
            };

            if (isOffline) {
                await offlineQueueService.enqueue('createOrder', 'order', offlineOrderId, {
                    order: payload,
                    localOrderSnapshot: payload,
                    localUpdatedAt: now.toISOString()
                }, {
                    storeId: payload.storeId || payload.companyId || 'KORG'
                });
                return offlineOrderId;
            }

            delete payload.id;
            const docRef = await addDoc(collection(db, COLLECTION), payload);
            const createdOrder = await this.getOrderById(docRef.id).catch(() => ({ id: docRef.id, ...orderData, ...payload, createdAt: new Date(), updatedAt: new Date() }));
            await dataIntegrityService.recordAuditLogSafely({
                type: 'ORDER_CREATED',
                entityType: 'order',
                entityId: docRef.id,
                orderId: docRef.id,
                storeId: createdOrder.storeId || createdOrder.companyId || '',
                companyId: createdOrder.companyId || createdOrder.storeId || '',
                details: buildOrderAuditDetails(createdOrder)
            }, {
                source: 'ui'
            });
            await googleSheetsService.syncOrderLifecycle(createdOrder);
            return docRef.id;
        } catch (error) {
            console.error("Error creating order:", error);
            throw error;
        }
    },

    async updateOrder(id, updates) {
        try {
            const docRef = doc(db, COLLECTION, id);
            const previousOrder = await this.getOrderById(id).catch(function() {
                return null;
            });
            await updateDoc(docRef, {
                ...updates,
                updatedAt: serverTimestamp()
            });
            const updatedOrder = await this.getOrderById(id).catch(() => ({ id, ...updates, updatedAt: new Date() }));
            await dataIntegrityService.recordAuditLogSafely({
                type: 'ORDER_UPDATED',
                entityType: 'order',
                entityId: id,
                orderId: id,
                storeId: updatedOrder.storeId || updatedOrder.companyId || '',
                companyId: updatedOrder.companyId || updatedOrder.storeId || '',
                details: {
                    before: buildOrderAuditDetails(previousOrder),
                    after: buildOrderAuditDetails(updatedOrder)
                }
            }, {
                source: 'ui'
            });
            if (previousOrder && previousOrder.status !== updatedOrder.status) {
                await dataIntegrityService.recordAuditLogSafely({
                    type: 'STATUS_CHANGED',
                    entityType: 'order',
                    entityId: id,
                    orderId: id,
                    previousStatus: previousOrder.status || '',
                    status: updatedOrder.status || '',
                    storeId: updatedOrder.storeId || updatedOrder.companyId || '',
                    companyId: updatedOrder.companyId || updatedOrder.storeId || '',
                    details: {
                        previousStatus: previousOrder.status || '',
                        nextStatus: updatedOrder.status || ''
                    }
                }, {
                    source: 'ui'
                });
            }
            await googleSheetsService.syncOrderLifecycle(updatedOrder);
            return true;
        } catch (error) {
            console.error("Error updating order:", error);
            throw error;
        }
    },

    async updateOrderAfterPrint(id, updates, trustedOrder) {
        if (offlineStatusService.isOnline()) {
            return this.updateOrder(id, updates);
        }

        var now = new Date();
        var source = trustedOrder || await getLocalOrderSnapshot(id) || { id: id };
        var localSnapshot = Object.assign({}, source, updates || {}, {
            id: id,
            updatedAt: now.toISOString(),
            localUpdatedAt: now.toISOString(),
            localUpdatedAtMillis: now.getTime(),
            syncState: source.offlineCreated ? 'offline_created' : 'pending_sync',
            syncStatus: 'pending',
            syncAction: 'markOrderPrinted'
        });
        var firestorePatch = Object.assign({}, updates || {});
        if (firestorePatch.printedAt instanceof Date) {
            firestorePatch.printedAt = firestorePatch.printedAt.toISOString();
        }

        await offlineQueueService.enqueue('markOrderPrinted', 'order', id, {
            firestorePatch: firestorePatch,
            localOrderSnapshot: localSnapshot,
            order: localSnapshot,
            localUpdatedAt: now.toISOString()
        }, {
            storeId: localSnapshot.storeId || localSnapshot.companyId || 'KORG'
        });
        return true;
    },

    async _updateOrderStatusDirect(id, status) {
        const updates = { status };
        if (status === ORDER_STATUS.FULFILLED) {
            updates.fulfilledAt = serverTimestamp();
        }
        if (status === ORDER_STATUS.PAID) {
            updates.paidAt = serverTimestamp();
        }
        return this.updateOrder(id, updates);
    },

    async updateOrderStatus(id, status) {
        const intent = updateOrderStatusIntentModule.createUpdateOrderStatusIntent(getCurrentActor(), {
            orderId: id,
            status,
            orderApi: {
                updateOrderStatusDirect: this._updateOrderStatusDirect.bind(this)
            }
        }, {
            source: 'order-service'
        });
        const result = await icfPipeline.run(intent);
        if (!result || result.ok !== true) {
            throw new Error('UpdateOrderStatusIntent failed: ' + getPipelineErrorMessage(result));
        }
        return result.intent && result.intent.context && result.intent.context.resultData
            ? result.intent.context.resultData.updateResult
            : true;
    },

    async archiveOrders(ids, options) {
        var service = this;
        var safeOptions = options || {};
        var intent = archiveSelectedOrdersIntentModule.createArchiveSelectedOrdersIntent(
            getCurrentActor(),
            {
                orderIds: ids
            },
            {
                source: safeOptions.source || 'orders-dashboard',
                onProgress: safeOptions.onProgress,
                archiveApi: {
                    archiveOrder: function(orderId) {
                        return service.archiveOrder(orderId);
                    }
                }
            }
        );
        var result = await icfPipeline.run(intent);
        if (!result || result.ok !== true) {
            throw new Error('ArchiveSelectedOrdersIntent failed: ' + getPipelineErrorMessage(result));
        }
        return result.data || {
            requested: 0,
            archived: 0,
            failed: 0,
            succeeded: [],
            failures: [],
            complete: false
        };
    },

    async unarchiveOrders(ids, options) {
        const service = this;
        const safeOptions = options || {};
        return runBulkOrderTransition(ids, function(orderId) {
            return service.unarchiveOrder(orderId);
        }, safeOptions.onProgress);
    },

    async archiveOrder(id) {
        try {
            const existingOrder = await this.getOrderById(id).catch(function() {
                return null;
            });
            if (!existingOrder) {
                throw new Error('Order not found.');
            }
            if (existingOrder.archived === true) {
                return { archived: true, alreadyArchived: true, transitioned: false, order: existingOrder };
            }
            const now = new Date();
            const userId = getCurrentUserId();

            if (isPendingLocalCreate(existingOrder)) {
                const compactedOrder = await offlineQueueService.compactPendingOrderCreate(id, {
                    archived: true,
                    archivedAt: now.toISOString(),
                    archivedAtLocal: now.getTime(),
                    archivedBy: userId,
                    syncStatus: 'pending',
                    syncAction: 'create',
                    syncState: 'offline_created'
                });
                return { local: true, archived: true, transitioned: true, order: compactedOrder || Object.assign({}, existingOrder || {}, { archived: true }) };
            }

            if (!offlineStatusService.isOnline()) {
                const localSnapshot = Object.assign({}, existingOrder || { id: id }, {
                    id: id,
                    archived: true,
                    archivedAt: now.toISOString(),
                    archivedAtLocal: now.getTime(),
                    archivedBy: userId,
                    updatedAt: now.toISOString(),
                    localUpdatedAt: now.toISOString(),
                    localUpdatedAtMillis: now.getTime(),
                    syncState: 'pending_sync',
                    syncStatus: 'pending',
                    syncAction: 'archive'
                });
                await offlineQueueService.enqueue('archiveOrder', 'order', id, {
                    firestorePatch: {
                        archived: true,
                        archivedAt: now.toISOString(),
                        archivedBy: userId
                    },
                    localOrderSnapshot: localSnapshot,
                    order: localSnapshot,
                    localUpdatedAt: now.toISOString(),
                    baseUpdatedAtMillis: getMillis(existingOrder.updatedAt || existingOrder.localUpdatedAt)
                }, {
                    storeId: localSnapshot.storeId || localSnapshot.companyId || 'KORG'
                });
                return { queued: true, archived: true, transitioned: true, order: localSnapshot };
            }

            const orderRef = doc(db, COLLECTION, id);
            const transitionResult = await runTransaction(db, async function(transaction) {
                const snapshot = await transaction.get(orderRef);
                if (!snapshot.exists()) throw new Error('Order not found.');
                const current = normalizeArchivedRecord(Object.assign({ id: snapshot.id }, snapshot.data()), ORDER_STATUS.DRAFT);
                if (current.archived === true) return { transitioned: false, order: current };
                transaction.update(orderRef, {
                    archived: true,
                    archivedAt: serverTimestamp(),
                    archivedBy: userId,
                    updatedAt: serverTimestamp()
                });
                return { transitioned: true, order: Object.assign({}, current, { archived: true, archivedAt: now, archivedBy: userId, updatedAt: now }) };
            });
            if (!transitionResult.transitioned) {
                return { archived: true, alreadyArchived: true, transitioned: false, order: transitionResult.order };
            }
            await dataIntegrityService.recordAuditLogSafely({
                type: 'ORDER_ARCHIVED',
                entityType: 'order',
                entityId: id,
                orderId: id,
                storeId: existingOrder ? existingOrder.storeId || existingOrder.companyId || '' : '',
                companyId: existingOrder ? existingOrder.companyId || existingOrder.storeId || '' : '',
                details: buildOrderAuditDetails(existingOrder)
            }, {
                source: 'ui'
            });
            await googleSheetsService.syncOrderLifecycle(transitionResult.order).catch(function(error) {
                console.warn('Order archived, but Google Sheets sync failed.', error);
            });
            return { archived: true, transitioned: true, order: transitionResult.order };
        } catch (error) {
            console.error("Error archiving order:", error);
            throw error;
        }
    },

    async unarchiveOrder(id) {
        try {
            const existingOrder = await this.getOrderById(id).catch(function() {
                return null;
            });
            if (!existingOrder) {
                throw new Error('Order not found.');
            }
            if (existingOrder.archived !== true) {
                return { unarchived: true, alreadyActive: true, transitioned: false, order: existingOrder };
            }
            const now = new Date();
            const userId = getCurrentUserId();
            const legacyCleanup = existingOrder && existingOrder.previousStatus
                ? { status: existingOrder.status || ORDER_STATUS.DRAFT, previousStatus: null }
                : {};

            if (isPendingLocalCreate(existingOrder)) {
                const compactedOrder = await offlineQueueService.compactPendingOrderCreate(id, Object.assign({}, legacyCleanup, {
                    archived: false,
                    archivedAt: null,
                    archivedAtLocal: null,
                    archivedBy: null,
                    unarchivedAt: now.toISOString(),
                    unarchivedAtLocal: now.getTime(),
                    unarchivedBy: userId,
                    syncStatus: 'pending',
                    syncAction: 'create',
                    syncState: 'offline_created'
                }));
                return { local: true, unarchived: true, transitioned: true, order: compactedOrder || Object.assign({}, existingOrder || {}, legacyCleanup, { archived: false }) };
            }

            if (!offlineStatusService.isOnline()) {
                const localSnapshot = Object.assign({}, existingOrder || { id: id }, legacyCleanup, {
                    id: id,
                    archived: false,
                    archivedAt: null,
                    archivedAtLocal: null,
                    archivedBy: null,
                    unarchivedAt: now.toISOString(),
                    unarchivedAtLocal: now.getTime(),
                    unarchivedBy: userId,
                    updatedAt: now.toISOString(),
                    localUpdatedAt: now.toISOString(),
                    localUpdatedAtMillis: now.getTime(),
                    syncState: 'pending_sync',
                    syncStatus: 'pending',
                    syncAction: 'unarchive'
                });
                await offlineQueueService.enqueue('unarchiveOrder', 'order', id, {
                    firestorePatch: Object.assign({}, legacyCleanup, {
                        archived: false,
                        archivedAt: null,
                        archivedBy: null,
                        unarchivedAt: now.toISOString(),
                        unarchivedBy: userId
                    }),
                    localOrderSnapshot: localSnapshot,
                    order: localSnapshot,
                    localUpdatedAt: now.toISOString(),
                    baseUpdatedAtMillis: getMillis(existingOrder.updatedAt || existingOrder.localUpdatedAt)
                }, {
                    storeId: localSnapshot.storeId || localSnapshot.companyId || 'KORG'
                });
                return { queued: true, unarchived: true, transitioned: true, order: localSnapshot };
            }

            const orderRef = doc(db, COLLECTION, id);
            const transitionResult = await runTransaction(db, async function(transaction) {
                const snapshot = await transaction.get(orderRef);
                if (!snapshot.exists()) throw new Error('Order not found.');
                const stored = Object.assign({ id: snapshot.id }, snapshot.data());
                const current = normalizeArchivedRecord(stored, ORDER_STATUS.DRAFT);
                if (current.archived !== true) return { transitioned: false, order: current };
                const transitionPatch = Object.assign({}, stored.previousStatus ? {
                    status: current.status || ORDER_STATUS.DRAFT,
                    previousStatus: null
                } : {}, {
                    archived: false,
                    archivedAt: null,
                    archivedBy: null,
                    unarchivedAt: serverTimestamp(),
                    unarchivedBy: userId,
                    updatedAt: serverTimestamp()
                });
                transaction.update(orderRef, transitionPatch);
                return { transitioned: true, order: Object.assign({}, current, transitionPatch, { unarchivedAt: now, updatedAt: now }) };
            });
            if (!transitionResult.transitioned) {
                return { unarchived: true, alreadyActive: true, transitioned: false, order: transitionResult.order };
            }
            await dataIntegrityService.recordAuditLogSafely({
                type: 'ORDER_UNARCHIVED',
                entityType: 'order',
                entityId: id,
                orderId: id,
                storeId: existingOrder ? existingOrder.storeId || existingOrder.companyId || '' : '',
                companyId: existingOrder ? existingOrder.companyId || existingOrder.storeId || '' : '',
                details: buildOrderAuditDetails(existingOrder)
            }, {
                source: 'ui'
            });
            await googleSheetsService.syncOrderLifecycle(transitionResult.order).catch(function(error) {
                console.warn('Order restored, but Google Sheets sync failed.', error);
            });
            return { unarchived: true, transitioned: true, order: transitionResult.order };
        } catch (error) {
            console.error("Error unarchiving order:", error);
            throw error;
        }
    },
    async deleteOrder(id) {
        const existingOrder = await this.getOrderById(id).catch(function() {
            return null;
        });
        if (isPendingLocalCreate(existingOrder)) {
            await offlineQueueService.removePendingOrderCreate(id);
            return { localRemoved: true };
        }
        return this.archiveOrder(id);
    }
};
