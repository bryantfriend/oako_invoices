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
    deleteDoc,
    updateDoc
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

            // Determine invoice date based on serverTimestamp (i.e. today)
            const d = new Date();
            let invoiceDate = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0); // Noon today to avoid TZ math


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
                createdAt: invoiceDate,
                dueDate: invoiceDate // could be config based
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

        // Added timeout wrapper to prevent hanging offline, allowing UI to show error instead of eternal loading
        let timeoutId;
        const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error('Invoice fetch timeout')), 15000);
        });

        try {
            const snap = await Promise.race([getDoc(docRef), timeoutPromise]);
            clearTimeout(timeoutId);
            return snap.exists() ? { id: snap.id, ...snap.data() } : null;
        } catch (error) {
            console.error("Failed to fetch invoice due to timeout or network:", error);
            throw error;
        }
    },

    async getAllInvoices() {
        const q = query(collection(db, COLLECTION), orderBy('createdAt', 'desc'));
        let timeoutId;
        const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error('Invoices fetch timeout')), 15000);
        });
        const snap = await Promise.race([getDocs(q), timeoutPromise]);
        clearTimeout(timeoutId);
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
    },

    async updateInvoiceDate(id, newDate) {
        try {
            const docRef = doc(db, COLLECTION, id);
            const dateObj = new Date(newDate + 'T12:00:00'); // Use noon to avoid TZ issues
            await updateDoc(docRef, {
                createdAt: dateObj,
                dueDate: dateObj,
                updatedAt: serverTimestamp()
            });
            return true;
        } catch (error) {
            console.error("Error updating invoice date:", error);
            throw error;
        }
    }
};
