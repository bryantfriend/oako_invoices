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
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { ORDER_STATUS } from "../core/constants.js";
import { googleSheetsService } from "./googleSheetsService.js";
import { dataIntegrityService } from "./dataIntegrityService.js";
import { createCollectionTimeoutError, logCollectionError } from "../core/firestoreDiagnostics.js";
import { getDocsWithCache } from "../core/firestoreRead.js";
import { offlineStatusService } from "./offlineStatusService.js";
import { offlineQueueService } from "./offlineQueueService.js";
import { deviceIdService } from "./deviceIdService.js";

const COLLECTION = 'orders';

function getCurrentUserId() {
    return auth.currentUser && auth.currentUser.uid ? auth.currentUser.uid : '';
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
    return Object.keys(byId).map(id => byId[id]);
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
            const rows = await getDocsWithCache(q, {
                collectionName: COLLECTION,
                cacheKey: 'orders:all:createdAt_desc',
                timeoutMs: 45000,
                attempts: 2
            });
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
            const timeoutPromise = new Promise((_, reject) => {
                timeoutId = setTimeout(() => reject(createCollectionTimeoutError(COLLECTION, 30000)), 30000);
            });
            const localOrder = await getLocalOrderSnapshot(id);
            if (!offlineStatusService.isOnline() && localOrder) {
                return localOrder;
            }
            const docSnap = offlineStatusService.isOnline()
                ? await Promise.race([getDoc(docRef), timeoutPromise])
                : await getDocFromCache(docRef);
            if (docSnap.exists()) {
                return Object.assign({ id: docSnap.id }, docSnap.data(), localOrder || {});
            }
            return localOrder;
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
                return docs[0];
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
            return docs.sort((a, b) => {
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

    async updateOrderStatus(id, status) {
        const updates = { status };
        if (status === ORDER_STATUS.FULFILLED) {
            updates.fulfilledAt = serverTimestamp();
        }
        if (status === ORDER_STATUS.PAID) {
            updates.paidAt = serverTimestamp();
        }
        return this.updateOrder(id, updates);
    },

    async archiveOrders(ids) {
        try {
            await Promise.all(ids.map(id => this.archiveOrder(id)));
            return true;
        } catch (error) {
            console.error("Error archiving orders:", error);
            throw error;
        }
    },

    async archiveOrder(id) {
        try {
            const existingOrder = await this.getOrderById(id).catch(function() {
                return null;
            });
            const now = new Date();
            const userId = getCurrentUserId();

            if (isPendingLocalCreate(existingOrder)) {
                const compactedOrder = await offlineQueueService.compactPendingOrderCreate(id, {
                    archived: true,
                    status: 'archived',
                    archivedAt: now.toISOString(),
                    archivedAtLocal: now.getTime(),
                    archivedBy: userId,
                    syncStatus: 'pending',
                    syncAction: 'create',
                    syncState: 'offline_created'
                });
                return { local: true, archived: true, order: compactedOrder || Object.assign({}, existingOrder || {}, { archived: true, status: 'archived' }) };
            }

            if (!offlineStatusService.isOnline()) {
                const localSnapshot = Object.assign({}, existingOrder || { id: id }, {
                    id: id,
                    archived: true,
                    status: 'archived',
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
                        status: 'archived',
                        archivedAt: now.toISOString(),
                        archivedBy: userId
                    },
                    localOrderSnapshot: localSnapshot,
                    order: localSnapshot,
                    localUpdatedAt: now.toISOString()
                }, {
                    storeId: localSnapshot.storeId || localSnapshot.companyId || 'KORG'
                });
                return { queued: true, archived: true, order: localSnapshot };
            }

            await this.updateOrder(id, {
                archived: true,
                status: 'archived',
                archivedAt: serverTimestamp(),
                archivedBy: userId
            });
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
            return { archived: true };
        } catch (error) {
            console.error("Error archiving order:", error);
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
