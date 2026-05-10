import { db } from "../core/firebase.js";
import {
    collection,
    addDoc,
    getDocs,
    query,
    serverTimestamp,
    where
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const COLLECTION = 'qr_activity_logs';

export const qrActivityService = {
    async log(action, details = {}) {
        try {
            await addDoc(collection(db, COLLECTION), {
                action,
                invoiceId: details.invoiceId || '',
                invoiceNumber: details.invoiceNumber || '',
                role: details.role || 'unknown',
                mode: details.mode || '',
                success: details.success !== false,
                details: details.details || {},
                createdAt: serverTimestamp()
            });
        } catch (error) {
            console.debug('QR activity log skipped.', error);
        }
    },

    async getByInvoiceId(invoiceId) {
        if (!invoiceId) return [];

        try {
            const q = query(collection(db, COLLECTION), where('invoiceId', '==', invoiceId));
            const snapshot = await getDocs(q);
            return snapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .sort((a, b) => getTime(b.createdAt) - getTime(a.createdAt));
        } catch (error) {
            console.warn('Could not load QR activity timeline.', error);
            return [];
        }
    }
};

function getTime(value) {
    if (!value) return 0;
    if (value.toDate) return value.toDate().getTime();
    if (value.seconds) return value.seconds * 1000;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}
