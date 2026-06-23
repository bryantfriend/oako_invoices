import { db } from "../core/firebase.js";
import {
    collection,
    addDoc,
    getDoc,
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

const COLLECTION = 'orders';

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
            return await getDocsWithCache(q, {
                collectionName: COLLECTION,
                cacheKey: 'orders:all:createdAt_desc',
                timeoutMs: 45000,
                attempts: 2
            });
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
            const docSnap = await Promise.race([getDoc(docRef), timeoutPromise]);
            if (docSnap.exists()) {
                return { id: docSnap.id, ...docSnap.data() };
            }
            return null;
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
            const payload = {
                ...orderData,
                status: ORDER_STATUS.DRAFT,
                createdBy: userId,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                invoiceGenerated: false
            };
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
            await this.updateOrder(id, {
                archived: true,
                archivedAt: serverTimestamp()
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
            return true;
        } catch (error) {
            console.error("Error archiving order:", error);
            throw error;
        }
    },

    async deleteOrder(id) {
        return this.archiveOrder(id);
    }
};
