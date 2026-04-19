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

    buildMobileUrl(invoice) {
        const payload = this.buildPayload(invoice);
        const encodedPayload = this.encodePayload(payload);
        return `${window.location.origin}${window.location.pathname}#/qr/${encodedPayload}`;
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

        const snap = await getDoc(doc(db, PUBLIC_LINK_COLLECTION, payload.token));
        if (!snap.exists()) return null;

        const invoice = { id: snap.data().invoiceId, ...snap.data() };
        const matchesInvoice = invoice.invoiceId === payload.invoiceId || invoice.id === payload.invoiceId;
        return matchesInvoice && invoice.token === payload.token ? invoice : null;
    }
};
