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
    serverTimestamp
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
                where('customerName', '==', customerName),
                orderBy('createdAt', 'desc'),
                limit(1)
            );
            const snapshot = await getDocs(q);
            if (!snapshot.empty) {
                return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
            }
            return null;
        } catch (error) {
            console.error("Error fetching last order:", error);
            // Don't throw, just return null to not break flow
            return null;
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
    }
};
