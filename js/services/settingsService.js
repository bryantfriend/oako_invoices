import { db } from "../core/firebase.js";
import {
    doc,
    getDoc,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { readCachedRowsAsync, writeCachedRows } from "../core/firestoreRead.js";
import { offlineStatusService } from "./offlineStatusService.js";
import { normalizeDefaultOrderPriceMode } from "../core/pricing.js";
import {
    getStorage,
    ref,
    uploadBytes,
    getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const storage = getStorage();
const COLLECTION = 'settings';
const DOCUMENT_ID = 'invoice_config';
const SETTINGS_CACHE_KEY = `${COLLECTION}:${DOCUMENT_ID}`;
const PENDING_SETTINGS_WRITE_KEY = 'kyrgyz-organics-pending-write:settings:invoice_config';
const SETTINGS_WRITE_TIMEOUT_MS = 15000;
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
    defaultInvoiceDateOffsetDays: 0,
    invoiceItemsPerPage: 7,
    logoUrl: '',
    footerText: 'Thanks for supporting sustainable agriculture!',
    courierPin: '23456',
    approvalLinkExpirationHours: 24,
    whatsappNumber: '',
    googleSheetId: '',
    googleSheetsWebhookUrl: '',
    syncEnabled: false,
    defaultOrderPriceMode: 'retail'
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
    const defaultInvoiceDateOffsetDays = Math.min(365, Math.max(-365, parseInt(data.defaultInvoiceDateOffsetDays, 10) || 0));

    return {
        ...data,
        defaultOrderPriceMode: normalizeDefaultOrderPriceMode(data.defaultOrderPriceMode),
        invoiceItemsPerPage,
        defaultInvoiceDateOffsetDays,
        approvalLinkExpirationHours,
        googleSheetId: getGoogleSheetId(data.googleSheetId),
        googleSheetsWebhookUrl: String(data.googleSheetsWebhookUrl || '').trim()
    };
}

function getLocalStorage() {
    if (typeof window === 'undefined' || !window.localStorage) {
        return null;
    }
    return window.localStorage;
}

function readPendingSettingsWrite() {
    const localStorage = getLocalStorage();
    if (!localStorage) {
        return null;
    }

    try {
        const raw = localStorage.getItem(PENDING_SETTINGS_WRITE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (error) {
        console.warn('[settings] Could not read pending settings write.', error);
        return null;
    }
}

function writePendingSettingsWrite(data) {
    const localStorage = getLocalStorage();
    if (!localStorage) {
        return;
    }

    localStorage.setItem(PENDING_SETTINGS_WRITE_KEY, JSON.stringify({
        data,
        savedAt: new Date().toISOString()
    }));
}

function clearPendingSettingsWrite() {
    const localStorage = getLocalStorage();
    if (localStorage) {
        localStorage.removeItem(PENDING_SETTINGS_WRITE_KEY);
    }
}

function isTransientSettingsWriteError(error) {
    const code = String(error && error.code ? error.code : '').toLowerCase();
    const message = String(error && error.message ? error.message : '').toLowerCase();

    if (code === 'permission-denied' || code === 'unauthenticated') {
        return false;
    }

    return !code
        || code === 'aborted'
        || code === 'cancelled'
        || code === 'deadline-exceeded'
        || code === 'internal'
        || code === 'resource-exhausted'
        || code === 'unavailable'
        || code === 'unknown'
        || message.indexOf('timeout') !== -1
        || message.indexOf('network') !== -1
        || message.indexOf('offline') !== -1;
}

function withSettingsWriteTimeout(promise) {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            const error = new Error('Settings save timeout');
            error.code = 'deadline-exceeded';
            reject(error);
        }, SETTINGS_WRITE_TIMEOUT_MS);
    });

    return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
}

function cacheInvoiceSettings(normalized, pendingSync = false) {
    invoiceSettingsCache = {
        ...DEFAULT_INVOICE_SETTINGS,
        ...normalized,
        __fromFallback: false,
        __pendingSync: pendingSync
    };
    writeCachedRows(SETTINGS_CACHE_KEY, [invoiceSettingsCache]);
    return invoiceSettingsCache;
}

function applyPendingSettings(settings) {
    const pendingWrite = readPendingSettingsWrite();
    if (!pendingWrite || !pendingWrite.data) {
        return settings;
    }

    invoiceSettingsCache = {
        ...settings,
        ...pendingWrite.data,
        __pendingSync: true,
        __pendingSavedAt: pendingWrite.savedAt || ''
    };
    writeCachedRows(SETTINGS_CACHE_KEY, [invoiceSettingsCache]);
    return invoiceSettingsCache;
}

async function writeInvoiceSettingsToServer(normalized) {
    const docRef = doc(db, COLLECTION, DOCUMENT_ID);
    await withSettingsWriteTimeout(setDoc(docRef, {
        ...normalized,
        updatedAt: serverTimestamp()
    }, { merge: true }));
    clearPendingSettingsWrite();
    return cacheInvoiceSettings(normalized, false);
}

export const settingsService = {
    async getInvoiceSettings() {
        if (invoiceSettingsCache) {
            return applyPendingSettings(invoiceSettingsCache);
        }

        if (!offlineStatusService.isOnline()) {
            const cachedSettings = (await readCachedRowsAsync(SETTINGS_CACHE_KEY))[0];
            if (cachedSettings) {
                invoiceSettingsCache = applyPendingSettings({ ...DEFAULT_INVOICE_SETTINGS, ...cachedSettings, __fromFallback: false, __fromCache: true });
                return invoiceSettingsCache;
            }
            return applyPendingSettings({ ...DEFAULT_INVOICE_SETTINGS, __fromFallback: true });
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
            invoiceSettingsCache = applyPendingSettings(invoiceSettingsCache);
            writeCachedRows(SETTINGS_CACHE_KEY, [invoiceSettingsCache]);
            this.flushPendingInvoiceSettings().catch(error => {
                console.warn('[settings] Pending settings sync failed.', error);
            });
            return invoiceSettingsCache;
        } catch (error) {
            const cachedSettings = (await readCachedRowsAsync(SETTINGS_CACHE_KEY))[0];
            if (cachedSettings) {
                invoiceSettingsCache = applyPendingSettings({ ...DEFAULT_INVOICE_SETTINGS, ...cachedSettings, __fromFallback: false, __fromCache: true });
                return invoiceSettingsCache;
            }
            console.warn("Failed to fetch settings, using defaults.", error);
            return applyPendingSettings({ ...DEFAULT_INVOICE_SETTINGS, __fromFallback: true });
        } finally {
            clearTimeout(timeoutId);
        }
    },

    async updateInvoiceSettings(data) {
        const normalized = normalizeInvoiceSettings(data);

        if (!offlineStatusService.isOnline()) {
            writePendingSettingsWrite(normalized);
            cacheInvoiceSettings(normalized, true);
            return { ok: true, pending: true };
        }

        try {
            await writeInvoiceSettingsToServer(normalized);
            return { ok: true, pending: false };
        } catch (error) {
            if (!isTransientSettingsWriteError(error)) {
                throw error;
            }
            writePendingSettingsWrite(normalized);
            cacheInvoiceSettings(normalized, true);
            return { ok: true, pending: true };
        }
    },

    async flushPendingInvoiceSettings() {
        const pendingWrite = readPendingSettingsWrite();
        if (!pendingWrite || !pendingWrite.data || !offlineStatusService.isOnline()) {
            return false;
        }

        await writeInvoiceSettingsToServer(normalizeInvoiceSettings(pendingWrite.data));
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

if (typeof window !== 'undefined') {
    window.addEventListener('kyrgyz-organics-online', function() {
        settingsService.flushPendingInvoiceSettings().catch(function(error) {
            console.warn('[settings] Pending settings sync failed.', error);
        });
    });
}
