import { db } from "../core/firebase.js";
import {
    doc,
    getDoc,
    setDoc,
    updateDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const COLLECTION = 'invoices';
const PUBLIC_LINK_COLLECTION = 'invoice_qr_links';

function createFallbackToken() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

function toBase64Url(value) {
    return btoa(unescape(encodeURIComponent(value)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}

function fromBase64Url(value) {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), '=');
    return decodeURIComponent(escape(atob(padded)));
}

export const qrService = {
    generateSecureToken() {
        return crypto.randomUUID ? crypto.randomUUID() : createFallbackToken();
    },

    buildPayload(invoice) {
        return {
            invoiceId: invoice.id,
            token: invoice.secureToken
        };
    },

    encodePayload(payload) {
        return toBase64Url(JSON.stringify(payload));
    },

    decodePayload(encodedPayload) {
        return JSON.parse(fromBase64Url(encodedPayload));
    },

    buildMobileUrl(invoice, mode = '') {
        const payload = this.buildPayload(invoice);
        const encodedPayload = this.encodePayload(payload);
        const modeSegment = mode === 'courier' || mode === 'customer' ? `/${mode}` : '';
        return `${window.location.origin}${window.location.pathname}#/qr${modeSegment}/${encodedPayload}`;
    },

    buildQrImageUrl(invoice, size = 140) {
        const qrData = this.buildMobileUrl(invoice);
        return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(qrData)}`;
    },

    buildPublicInvoiceSnapshot(invoice) {
        return {
            invoiceId: invoice.id,
            token: invoice.secureToken,
            invoiceNumber: invoice.invoiceNumber || '',
            customerName: invoice.customerName || '',
            customerPinCode: invoice.customerPinCode || invoice.pinCode || '',
            items: invoice.items || [],
            totalAmount: invoice.totalAmount || 0,
            createdAt: invoice.createdAt || null,
            returnRequested: invoice.returnRequested || false,
            returnItems: invoice.returnItems || [],
            status: invoice.status || 'pending',
            updatedAt: serverTimestamp()
        };
    },

    async publishPublicInvoiceSnapshot(invoice) {
        if (!invoice?.secureToken) return null;
        const snapshot = this.buildPublicInvoiceSnapshot(invoice);
        await setDoc(doc(db, PUBLIC_LINK_COLLECTION, invoice.secureToken), snapshot, { merge: true });
        return snapshot;
    },

    async ensureInvoiceToken(invoice) {
        if (!invoice) return null;
        if (invoice.secureToken) {
            await this.publishPublicInvoiceSnapshot(invoice);
            return invoice;
        }

        const secureToken = this.generateSecureToken();
        await updateDoc(doc(db, COLLECTION, invoice.id), { secureToken });
        const tokenizedInvoice = { ...invoice, secureToken };
        await this.publishPublicInvoiceSnapshot(tokenizedInvoice);
        return tokenizedInvoice;
    },

    async validatePayload(payload) {
        if (!payload?.invoiceId || !payload?.token) return null;

        const publicSnap = await getDoc(doc(db, PUBLIC_LINK_COLLECTION, payload.token));
        if (publicSnap.exists()) {
            const invoice = { id: publicSnap.data().invoiceId, ...publicSnap.data() };
            const matchesInvoice = invoice.invoiceId === payload.invoiceId || invoice.id === payload.invoiceId;
            if (matchesInvoice && invoice.token === payload.token) {
                return invoice;
            }
        }

        const invoiceSnap = await getDoc(doc(db, COLLECTION, payload.invoiceId));
        if (!invoiceSnap.exists()) return null;

        const invoice = { id: invoiceSnap.id, ...invoiceSnap.data() };
        if (invoice.secureToken !== payload.token) return null;

        await this.publishPublicInvoiceSnapshot(invoice);
        return invoice;
    }
};
