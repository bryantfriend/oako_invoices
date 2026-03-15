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
                const existingInvoice = { id: existing.docs[0].id, ...existing.docs[0].data() };
                await this.syncInvoiceWithOrder(orderId, existingInvoice);
                return existingInvoice.id;
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
            if (!snap.exists()) return null;

            const invoice = { id: snap.id, ...snap.data() };
            if (!invoice.orderId) return invoice;

            const order = await orderService.getOrderById(invoice.orderId).catch(() => null);
            if (!order) return invoice;

            return this.buildInvoiceFromOrder(invoice, order);
        } catch (error) {
            console.error("Failed to fetch invoice due to timeout or network:", error);
            throw error;
        } finally {
            clearTimeout(timeoutId);
        }
    },

    async getAllInvoices() {
        const q = query(collection(db, COLLECTION), orderBy('createdAt', 'desc'));
        let timeoutId;
        const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error('Invoices fetch timeout')), 15000);
        });
        try {
            const snap = await Promise.race([getDocs(q), timeoutPromise]);
            return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } finally {
            clearTimeout(timeoutId);
        }
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
    },

    async syncInvoiceWithOrder(orderId, existingInvoice = null) {
        try {
            const invoice = existingInvoice || await this.getInvoiceByOrderId(orderId);
            if (!invoice) return null;

            const order = await orderService.getOrderById(orderId);
            if (!order) throw new Error("Order not found");

            const syncedInvoice = this.buildInvoiceFromOrder(invoice, order);

            await updateDoc(doc(db, COLLECTION, invoice.id), {
                customerName: syncedInvoice.customerName,
                customerAddress: syncedInvoice.customerAddress,
                items: syncedInvoice.items,
                subtotal: syncedInvoice.subtotal,
                taxAmount: syncedInvoice.taxAmount,
                discountAmount: syncedInvoice.discountAmount,
                totalAmount: syncedInvoice.totalAmount,
                updatedAt: serverTimestamp()
            });

            return invoice.id;
        } catch (error) {
            console.error("Error syncing invoice with order:", error);
            throw error;
        }
    },

    async getInvoiceByOrderId(orderId) {
        try {
            const q = query(collection(db, COLLECTION), where('orderId', '==', orderId));
            const snap = await getDocs(q);
            if (snap.empty) return null;
            const first = snap.docs[0];
            return { id: first.id, ...first.data() };
        } catch (error) {
            console.error("Error fetching invoice by order ID:", error);
            throw error;
        }
    },

    buildInvoiceFromOrder(invoice, order) {
        const items = order.items || [];
        const subtotal = items.reduce((sum, item) => {
            const finalQty = item.adjustedQuantity !== undefined ? item.adjustedQuantity : item.quantity;
            return sum + ((item.price || 0) * finalQty);
        }, 0);

        const taxRate = invoice.taxRate || 0;
        const taxAmount = (subtotal * taxRate) / 100;

        let discountAmount = invoice.discountAmount || 0;
        if (invoice.discountType === 'percent' && invoice.discountValue) {
            discountAmount = (subtotal * invoice.discountValue) / 100;
        } else if (invoice.discountType === 'fixed') {
            discountAmount = invoice.discountValue || 0;
        }

        return {
            ...invoice,
            customerName: order.customerName,
            customerAddress: order.customerAddress || '',
            items,
            subtotal,
            taxAmount,
            discountAmount,
            totalAmount: subtotal + taxAmount - discountAmount
        };
    }
};
