import { db } from "../core/firebase.js";
import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    where,
    limit,
    setDoc,
    updateDoc,
    addDoc,
    serverTimestamp,
    writeBatch
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const APPROVAL_LINK_COLLECTION = 'invoiceApprovalLinks';
const NOTIFICATION_COLLECTION = 'notifications';
const DEFAULT_EXPIRATION_HOURS = 24;

function getTime(value) {
    if (!value) {
        return 0;
    }
    if (typeof value.toDate === 'function') {
        return value.toDate().getTime();
    }
    if (value.seconds) {
        return value.seconds * 1000;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function getQuantity(item) {
    return Number(item.adjustedQuantity !== undefined ? item.adjustedQuantity : item.quantity) || 0;
}

function mapApprovalSnapshot(documentSnapshot) {
    if (!documentSnapshot.exists()) {
        return null;
    }
    return Object.assign({ id: documentSnapshot.id }, documentSnapshot.data());
}

function sortNewestApprovalLink(a, b) {
    return getTime(b.createdAt) - getTime(a.createdAt);
}

function createHexToken(byteLength) {
    const bytes = new Uint8Array(byteLength);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, function(byte) {
        return byte.toString(16).padStart(2, '0');
    }).join('');
}

function normalizeExpirationHours(value) {
    const parsed = parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
        return DEFAULT_EXPIRATION_HOURS;
    }
    return Math.min(parsed, 720);
}

function buildApprovalDocument(invoice, token, expirationHours) {
    const expiresAt = new Date(Date.now() + normalizeExpirationHours(expirationHours) * 60 * 60 * 1000);
    return {
        invoiceId: invoice.id,
        token: token,
        status: 'pending',
        createdAt: serverTimestamp(),
        expiresAt: expiresAt,
        responseSubmittedAt: null,
        responseType: null,
        customerChanges: null,
        invoiceSnapshot: invoiceApprovalService.buildInvoiceSnapshot(invoice)
    };
}

export const invoiceApprovalService = {
    generateSecureApprovalToken() {
        return createHexToken(32);
    },

    getApprovalExpirationHours(settings) {
        return normalizeExpirationHours(settings && settings.approvalLinkExpirationHours);
    },

    buildApprovalUrl(token) {
        if (typeof window === 'undefined') {
            return '/order-review.html?token=' + encodeURIComponent(token);
        }

        const url = new URL('order-review.html', window.location.href);
        url.hash = '';
        url.search = '';
        url.searchParams.set('token', token);
        return url.toString();
    },

    buildInvoiceSnapshot(invoice) {
        const items = (invoice.items || []).map(function(item) {
            return {
                productId: item.productId || '',
                name: item.name || item.productName || item.name_en || 'Product',
                quantity: getQuantity(item),
                price: Number(item.price) || 0,
                notes: item.notes || ''
            };
        });

        return {
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber || '',
            customerName: invoice.customerName || '',
            customerAddress: invoice.customerAddress || '',
            items: items,
            subtotal: Number(invoice.subtotal) || 0,
            taxRate: Number(invoice.taxRate) || 0,
            taxAmount: Number(invoice.taxAmount) || 0,
            discountAmount: Number(invoice.discountAmount) || 0,
            totalAmount: Number(invoice.totalAmount) || 0,
            createdAt: invoice.createdAt || null
        };
    },

    async createApprovalLink(invoice, token, expirationHours) {
        const documentRef = doc(db, APPROVAL_LINK_COLLECTION, token);
        const existingSnapshot = await getDoc(documentRef);
        if (existingSnapshot.exists()) {
            throw new Error('Approval token already exists. Please generate a new link.');
        }

        const approvalDocument = buildApprovalDocument(invoice, token, expirationHours);
        await setDoc(documentRef, approvalDocument);

        return Object.assign({ id: token }, approvalDocument, {
            createdAt: new Date(),
            expiresAt: approvalDocument.expiresAt,
            approvalUrl: this.buildApprovalUrl(token)
        });
    },

    async getApprovalLinkByToken(token) {
        if (!token) {
            return null;
        }

        const snapshot = await getDoc(doc(db, APPROVAL_LINK_COLLECTION, token));
        return mapApprovalSnapshot(snapshot);
    },

    async getLatestApprovalLinkForInvoice(invoiceId) {
        if (!invoiceId) {
            return null;
        }

        const approvalQuery = query(
            collection(db, APPROVAL_LINK_COLLECTION),
            where('invoiceId', '==', invoiceId),
            limit(25)
        );
        const snapshot = await getDocs(approvalQuery);
        const approvalLinks = snapshot.docs.map(mapApprovalSnapshot).filter(Boolean).sort(sortNewestApprovalLink);
        return approvalLinks[0] || null;
    },

    isApprovalLinkExpired(approvalLink, now) {
        const checkedAt = now || new Date();
        return getTime(approvalLink && approvalLink.expiresAt) <= checkedAt.getTime();
    },

    getDisplayStatus(approvalLink) {
        if (!approvalLink) {
            return 'Not Generated';
        }
        if (approvalLink.status === 'pending' && this.isApprovalLinkExpired(approvalLink)) {
            return 'Expired';
        }
        if (approvalLink.status === 'accepted') {
            return 'Customer Accepted Order';
        }
        if (approvalLink.status === 'modified') {
            return 'Customer Requested Changes';
        }
        return 'Waiting for Response';
    },

    async loadCustomerReview(token) {
        const approvalLink = await this.getApprovalLinkByToken(token);
        if (!approvalLink) {
            return {
                ok: false,
                reason: 'This approval link has expired.'
            };
        }
        if (this.isApprovalLinkExpired(approvalLink)) {
            return {
                ok: false,
                reason: 'This approval link has expired.',
                approvalLink: approvalLink
            };
        }
        return {
            ok: true,
            approvalLink: approvalLink,
            invoice: approvalLink.invoiceSnapshot || {}
        };
    },

    async saveCustomerResponse(approvalLink, responseType, customerChanges) {
        const status = responseType === 'accepted' ? 'accepted' : 'modified';
        const batch = writeBatch(db);
        const approvalRef = doc(db, APPROVAL_LINK_COLLECTION, approvalLink.token);
        const notificationRef = doc(collection(db, NOTIFICATION_COLLECTION));

        batch.update(approvalRef, {
            status: status,
            responseType: status,
            responseSubmittedAt: serverTimestamp(),
            customerChanges: customerChanges || null
        });

        batch.set(notificationRef, {
            type: 'invoiceApprovalResponse',
            invoiceId: approvalLink.invoiceId,
            responseType: status,
            createdAt: serverTimestamp()
        });

        await batch.commit();

        return {
            status: status,
            responseType: status,
            responseSubmittedAt: new Date(),
            customerChanges: customerChanges || null
        };
    },

    async createNotification(record) {
        await addDoc(collection(db, NOTIFICATION_COLLECTION), Object.assign({}, record, {
            createdAt: serverTimestamp()
        }));
    },

    async markApprovalLinkExpired(approvalLink) {
        if (!approvalLink || approvalLink.status !== 'pending') {
            return false;
        }
        await updateDoc(doc(db, APPROVAL_LINK_COLLECTION, approvalLink.token), {
            status: 'expired'
        });
        return true;
    }
};
