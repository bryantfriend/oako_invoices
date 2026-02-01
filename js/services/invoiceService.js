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
    serverTimestamp,
    deleteDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { orderService } from "./orderService.js";
import { settingsService } from "./settingsService.js";

const COLLECTION = 'invoices';

export const invoiceService = {
    async createInvoice(orderId, adjustments = {}) {
        try {
            // Adjustments: { taxRate, discountType, discountValue }
            // Check if invoice already exists
            const q = query(collection(db, COLLECTION), where('orderId', '==', orderId));
            const existing = await getDocs(q);
            if (!existing.empty) {
                return existing.docs[0].id;
            }

            const [order, settings] = await Promise.all([
                orderService.getOrderById(orderId),
                settingsService.getInvoiceSettings()
            ]);

            if (!order) throw new Error("Order not found");

            const invoiceNumber = `INV-${Date.now().toString().substr(-6)}`;

            // Calculate Financials
            const subtotal = order.totalAmount || 0;
            const taxRate = adjustments.taxRate !== undefined ? adjustments.taxRate : settings.defaultTaxRate;
            const taxAmount = (subtotal * taxRate) / 100;

            let discountAmount = 0;
            if (adjustments.discountValue) {
                if (adjustments.discountType === 'percent') {
                    discountAmount = (subtotal * adjustments.discountValue) / 100;
                } else {
                    discountAmount = adjustments.discountValue;
                }
            }

            const totalAmount = subtotal + taxAmount - discountAmount;

            const payload = {
                orderId,
                invoiceNumber,
                customerName: order.customerName,
                customerAddress: order.customerAddress || '',
                items: order.items,
                subtotal,
                taxRate,
                taxAmount,
                discountType: adjustments.discountType || 'none',
                discountValue: adjustments.discountValue || 0,
                discountAmount,
                totalAmount, // grand total
                settings, // Snapshot settings at time of creation
                createdAt: serverTimestamp(),
                dueDate: serverTimestamp() // could be config based
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
    },

    async deleteInvoice(id) {
        try {
            const docRef = doc(db, COLLECTION, id);
            await deleteDoc(docRef);
            return true;
        } catch (error) {
            console.error("Error deleting invoice:", error);
            throw error;
        }
    }
};
