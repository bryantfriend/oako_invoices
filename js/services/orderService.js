import { db } from "../core/firebase.js";
import {
    collection,
    addDoc,
    getDocs,
    getDoc,
    doc,
    updateDoc,
    query,
    orderBy,
    where,
    limit,
    serverTimestamp,
    deleteDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { ORDER_STATUS } from "../core/constants.js";
import { googleSheetsService } from "./googleSheetsService.js";

const COLLECTION = 'orders';

export const orderService = {
    async getAllOrders() {
        let timeoutId;
        try {
            const q = query(collection(db, COLLECTION), orderBy('createdAt', 'desc'));
            const timeoutPromise = new Promise((_, reject) => {
                timeoutId = setTimeout(() => reject(new Error('Orders fetch timeout')), 30000);
            });
            const snapshot = await Promise.race([getDocs(q), timeoutPromise]);
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error("Error fetching orders:", error);
            throw error;
        } finally {
            clearTimeout(timeoutId);
        }
    },

    async getOrderById(id) {
        let timeoutId;
        try {
            const docRef = doc(db, COLLECTION, id);
            const timeoutPromise = new Promise((_, reject) => {
                timeoutId = setTimeout(() => reject(new Error('Order fetch timeout')), 30000);
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
            const snapshot = await getDocs(q);
            if (!snapshot.empty) {
                const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
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
            const snapshot = await getDocs(q);
            const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

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
            await updateDoc(docRef, {
                ...updates,
                updatedAt: serverTimestamp()
            });
            const updatedOrder = await this.getOrderById(id).catch(() => ({ id, ...updates, updatedAt: new Date() }));
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
            await Promise.all(ids.map(id => this.updateOrder(id, { archived: true })));
            return true;
        } catch (error) {
            console.error("Error archiving orders:", error);
            throw error;
        }
    },

    async deleteOrder(id) {
        try {
            const docRef = doc(db, COLLECTION, id);
            await deleteDoc(docRef);
            return true;
        } catch (error) {
            console.error("Error deleting order:", error);
            throw error;
        }
    }
};
