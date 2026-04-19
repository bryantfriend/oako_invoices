import { db } from "../core/firebase.js";
import {
    collection,
    addDoc,
    serverTimestamp
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
                createdAt: serverTimestamp()
            });
        } catch (error) {
            console.debug('QR activity log skipped.', error);
        }
    }
};
