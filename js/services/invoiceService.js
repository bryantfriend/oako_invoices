import { db } from "../core/firebase.js";
import {
    collection,
    addDoc,
    getDocs,
    getDoc,
    doc,
    query,
    where,
    orderBy,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { orderService } from "./orderService.js";

const COLLECTION = 'invoices';

export const invoiceService = {
    async createInvoice(orderId) {
        try {
            // Check if invoice already exists
            const q = query(collection(db, COLLECTION), where('orderId', '==', orderId));
            const existing = await getDocs(q);
            if (!existing.empty) {
                return existing.docs[0].id; // Return existing invoice ID
            }

            const order = await orderService.getOrderById(orderId);
            if (!order) throw new Error("Order not found");

            const invoiceNumber = `INV-${Date.now().toString().substr(-6)}`;

            const payload = {
                orderId,
                invoiceNumber,
                customerName: order.customerName,
                items: order.items,
                totalAmount: order.totalAmount, // or calculated from items
                createdAt: serverTimestamp(),
                dueDate: serverTimestamp() // + 30 days ideally
            };

            const docRef = await addDoc(collection(db, COLLECTION), payload);
            return docRef.id;
        } catch (error) {
            console.error("Error creating invoice:", error);
            throw error;
        }
    },

    async getInvoice(id) {
        const docRef = doc(db, COLLECTION, id);
        const snap = await getDoc(docRef);
        return snap.exists() ? { id: snap.id, ...snap.data() } : null;
    },

    async getAllInvoices() {
        const q = query(collection(db, COLLECTION), orderBy('createdAt', 'desc'));
        const snap = await getDocs(q);
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
};
