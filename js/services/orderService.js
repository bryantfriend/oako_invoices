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

const COLLECTION = 'orders';

export const orderService = {
    async getAllOrders() {
        try {
            const q = query(collection(db, COLLECTION), orderBy('createdAt', 'desc'));
            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error("Error fetching orders:", error);
            throw error;
        }
    },

    async getOrderById(id) {
        try {
            const docRef = doc(db, COLLECTION, id);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                return { id: docSnap.id, ...docSnap.data() };
            }
            return null;
        } catch (error) {
            console.error("Error fetching order:", error);
            throw error;
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
            return true;
        } catch (error) {
            console.error("Error updating order:", error);
            throw error;
        }
    },

    async updateOrderStatus(id, status) {
        return this.updateOrder(id, { status });
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
