import { db } from "../core/firebase.js";
import {
    doc,
    getDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { googleSheetsService } from "./googleSheetsService.js";
import { orderService } from "./orderService.js";
import { invoiceService } from "./invoiceService.js";
import { offlineStatusService } from "./offlineStatusService.js";

const COLLECTION = 'invoices';

async function getInvoice(invoiceId) {
    const snap = await getDoc(doc(db, COLLECTION, invoiceId));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

function buildOrderReturnMirror(order = {}, items = [], options = {}) {
    const orderItems = (order.items || []).map((item, index) => {
        const productId = item.productId || item.id || `${index}`;
        const returnItem = items.find(entry => entry.productId === productId);
        return {
            ...item,
            returnQuantity: Number(returnItem?.quantity) || 0
        };
    });

    return {
        returnRequested: items.length > 0,
        returnItems: items,
        returnNote: options.returnNote || '',
        returnedBy: options.returnedBy || '',
        orderItemsReturnedAt: new Date(),
        items: orderItems
    };
}

export const returnsService = {
    async syncInvoiceReturnToOrder(invoiceOrId, options = {}) {
        const invoice = typeof invoiceOrId === 'string'
            ? await getInvoice(invoiceOrId)
            : invoiceOrId;

        if (!invoice?.orderId) return { skipped: true };

        const items = (invoice.returnItems || [])
            .filter(item => item.productId && (Number(item.quantity) || 0) > 0)
            .map(item => ({
                productId: item.productId,
                quantity: Number(item.quantity) || 0
            }));

        const order = await orderService.getOrderById(invoice.orderId).catch(() => null);
        if (!order) return { skipped: true, reason: 'order_not_found' };

        await orderService.updateOrder(invoice.orderId, buildOrderReturnMirror(order, items, {
            returnNote: invoice.returnNote || options.returnNote || '',
            returnedBy: invoice.returnedBy || options.returnedBy || ''
        }));

        return { synced: true };
    },

    async requestReturn(invoiceOrId, returnItems = [], options = {}) {
        const invoice = typeof invoiceOrId === 'string'
            ? await getInvoice(invoiceOrId)
            : invoiceOrId;
        if (!invoice) {
            throw new Error('Invoice not found');
        }

        const items = returnItems
            .filter(item => item.productId && (Number(item.quantity) || 0) > 0)
            .map(item => ({
                productId: item.productId,
                quantity: Number(item.quantity) || 0
            }));

        const returnedAtValue = offlineStatusService.isOnline() ? serverTimestamp() : new Date();

        await invoiceService.updateInvoice(invoice.id || invoice.invoiceId, {
            returnRequested: items.length > 0,
            returnItems: items,
            returnPhotos: options.returnPhotos || [],
            returnNote: options.returnNote || '',
            returnedBy: options.returnedBy || '',
            returnedAt: returnedAtValue,
            status: items.length > 0 ? 'return_pending' : 'pending',
            updatedAt: new Date()
        }, 'addReturn');

        if (offlineStatusService.isOnline()) {
            try {
                await this.syncInvoiceReturnToOrder({
                    ...invoice,
                    returnItems: items,
                    returnRequested: items.length > 0,
                    returnNote: options.returnNote || '',
                    returnedBy: options.returnedBy || ''
                }, options);
            } catch (error) {
                console.warn('Return saved to invoice, but order mirror sync was skipped.', error);
            }
        }

        return true;
    },

    async markCompleted(invoiceId) {
        if (!offlineStatusService.isOnline()) {
            await invoiceService.updateInvoice(invoiceId, {
                status: 'completed'
            }, 'completeInvoice');
            return true;
        }

        await invoiceService.updateInvoice(invoiceId, {
            status: 'completed'
        }, 'completeInvoice');

        const invoice = await invoiceService.getInvoice(invoiceId);
        if (invoice) {
            await googleSheetsService.syncCompletedInvoice(invoice);
        }

        return true;
    }
};
