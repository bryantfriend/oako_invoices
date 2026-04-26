import { db } from "../core/firebase.js";
import {
    doc,
    getDoc,
    updateDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { googleSheetsService } from "./googleSheetsService.js";
import { orderService } from "./orderService.js";

const COLLECTION = 'invoices';

async function getInvoice(invoiceId) {
    const snap = await getDoc(doc(db, COLLECTION, invoiceId));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export const returnsService = {
    async requestReturn(invoiceId, returnItems = [], options = {}) {
        const invoice = await getInvoice(invoiceId);
        if (!invoice) {
            throw new Error('Invoice not found');
        }

        const items = returnItems
            .filter(item => item.productId && (Number(item.quantity) || 0) > 0)
            .map(item => ({
                productId: item.productId,
                quantity: Number(item.quantity) || 0
            }));

        await updateDoc(doc(db, COLLECTION, invoiceId), {
            returnRequested: items.length > 0,
            returnItems: items,
            returnPhotos: options.returnPhotos || [],
            returnNote: options.returnNote || '',
            returnedBy: options.returnedBy || '',
            returnedAt: serverTimestamp(),
            status: items.length > 0 ? 'return_pending' : 'pending',
            updatedAt: serverTimestamp()
        });

        if (invoice.orderId) {
            const order = await orderService.getOrderById(invoice.orderId).catch(() => null);
            if (order) {
                const orderItems = (order.items || []).map((item, index) => {
                    const productId = item.productId || item.id || `${index}`;
                    const returnItem = items.find(entry => entry.productId === productId);
                    return {
                        ...item,
                        returnQuantity: Number(returnItem?.quantity) || 0
                    };
                });

                await orderService.updateOrder(invoice.orderId, {
                    returnRequested: items.length > 0,
                    returnItems: items,
                    returnNote: options.returnNote || '',
                    returnedBy: options.returnedBy || '',
                    orderItemsReturnedAt: new Date(),
                    items: orderItems
                });
            }
        }

        return true;
    },

    async markCompleted(invoiceId) {
        const docRef = doc(db, COLLECTION, invoiceId);
        await updateDoc(docRef, {
            status: 'completed',
            updatedAt: serverTimestamp()
        });

        const invoice = await getInvoice(invoiceId);
        if (invoice) {
            await googleSheetsService.syncCompletedInvoice(invoice);
        }

        return true;
    }
};
