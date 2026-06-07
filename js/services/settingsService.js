import { db } from "../core/firebase.js";
import {
    doc,
    getDoc,
    setDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
    getStorage,
    ref,
    uploadBytes,
    getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const storage = getStorage();
const COLLECTION = 'settings';
const DOCUMENT_ID = 'invoice_config';
let invoiceSettingsCache = null;

export const DEFAULT_INVOICE_SETTINGS = {
    companyName: 'Kyrgyz Organics',
    address: 'Republic of Kyrgyzstan',
    phone: '+996 700 123 456',
    website: 'kyrgyz-organics.com',
    bankInfo: 'Bank of Kyrgyzstan,\nKyrgyzz Organics Ltd, KG12346712345789901\nAccount To: KG12346712345789901\nSWIFT: KGZBBBBB',
    qrText: 'https://kyrgyz-organics.com/pay',
    paymentQrImageUrl: '',
    defaultTaxRate: 0,
    invoiceItemsPerPage: 7,
    logoUrl: '',
    footerText: 'Thanks for supporting sustainable agriculture!',
    courierPin: '23456',
    approvalLinkExpirationHours: 24,
    whatsappNumber: '',
    googleSheetId: '',
    googleSheetsWebhookUrl: '',
    syncEnabled: false
};

export function getGoogleSheetId(value = '') {
    const rawValue = String(value || '').trim();
    if (!rawValue) return '';

    const urlMatch = rawValue.match(/\/spreadsheets\/d\/([^/?#]+)/i);
    const sheetId = urlMatch ? urlMatch[1] : rawValue.split(/[?#]/)[0];

    try {
        return decodeURIComponent(sheetId).trim();
    } catch (_) {
        return sheetId.trim();
    }
}

export function buildGoogleSheetUrl(sheetId = '') {
    const normalizedId = getGoogleSheetId(sheetId);
    return normalizedId ? `https://docs.google.com/spreadsheets/d/${encodeURIComponent(normalizedId)}/edit` : '';
}

function normalizeInvoiceSettings(data = {}) {
    const invoiceItemsPerPage = Math.min(30, Math.max(1, parseInt(data.invoiceItemsPerPage, 10) || DEFAULT_INVOICE_SETTINGS.invoiceItemsPerPage));
    const approvalLinkExpirationHours = Math.min(720, Math.max(1, parseInt(data.approvalLinkExpirationHours, 10) || DEFAULT_INVOICE_SETTINGS.approvalLinkExpirationHours));

    return {
        ...data,
        invoiceItemsPerPage,
        approvalLinkExpirationHours,
        googleSheetId: getGoogleSheetId(data.googleSheetId),
        googleSheetsWebhookUrl: String(data.googleSheetsWebhookUrl || '').trim()
    };
}

export const settingsService = {
    async getInvoiceSettings() {
        if (invoiceSettingsCache) {
            return invoiceSettingsCache;
        }

        let timeoutId;
        try {
            const docRef = doc(db, COLLECTION, DOCUMENT_ID);

            // Give Firestore more time before assuming settings are unavailable.
            const timeoutPromise = new Promise((_, reject) => {
                timeoutId = setTimeout(() => reject(new Error('Settings fetch timeout')), 30000);
            });
            const snap = await Promise.race([getDoc(docRef), timeoutPromise]);

            invoiceSettingsCache = snap.exists()
                ? { ...DEFAULT_INVOICE_SETTINGS, ...snap.data(), __fromFallback: false }
                : { ...DEFAULT_INVOICE_SETTINGS, __fromFallback: false };
            return invoiceSettingsCache;
        } catch (error) {
            console.warn("Failed to fetch settings, using defaults.", error);
            return { ...DEFAULT_INVOICE_SETTINGS, __fromFallback: true };
        } finally {
            clearTimeout(timeoutId);
        }
    },

    async updateInvoiceSettings(data) {
        const docRef = doc(db, COLLECTION, DOCUMENT_ID);
        const normalized = normalizeInvoiceSettings(data);
        await setDoc(docRef, { ...normalized, updatedAt: new Date() }, { merge: true });
        invoiceSettingsCache = { ...DEFAULT_INVOICE_SETTINGS, ...normalized, __fromFallback: false };
        return true;
    },

    async uploadLogo(file) {
        return this.uploadImageAsset(file, 'brand', 'logo');
    },

    async uploadPaymentQrImage(file) {
        return this.uploadImageAsset(file, 'brand', 'payment_qr');
    },

    async uploadImageAsset(file, folder, prefix) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${prefix}_${Date.now()}.${fileExt}`;
        const storageRef = ref(storage, `${folder}/${fileName}`);

        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);
        return url;
    }
};
