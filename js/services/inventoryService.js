import { db } from "../core/firebase.js";
import {
    collection,
    doc,
    getDoc,
    setDoc,
    query,
    where,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getDocsWithCache, readCachedRowsAsync, writeCachedRows } from "../core/firestoreRead.js";
import { offlineStatusService } from "./offlineStatusService.js";

const COLLECTION = 'inventory';
const SETTINGS_DOC = 'inventory_settings';
const INVENTORY_SETTINGS_CACHE_KEY = 'inventory:settings';
const PENDING_INVENTORY_SETTINGS_WRITE_KEY = 'kyrgyz-organics-pending-write:settings:inventory_settings';
const INVENTORY_SETTINGS_WRITE_TIMEOUT_MS = 15000;

function getLocalStorage() {
    if (typeof window === 'undefined' || !window.localStorage) {
        return null;
    }
    return window.localStorage;
}

function readPendingInventorySettingsWrite() {
    const localStorage = getLocalStorage();
    if (!localStorage) {
        return null;
    }

    try {
        const raw = localStorage.getItem(PENDING_INVENTORY_SETTINGS_WRITE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (error) {
        console.warn('[inventory-settings] Could not read pending settings write.', error);
        return null;
    }
}

function writePendingInventorySettingsWrite(settings) {
    const localStorage = getLocalStorage();
    if (!localStorage) {
        return;
    }

    localStorage.setItem(PENDING_INVENTORY_SETTINGS_WRITE_KEY, JSON.stringify({
        data: settings,
        savedAt: new Date().toISOString()
    }));
}

function clearPendingInventorySettingsWrite() {
    const localStorage = getLocalStorage();
    if (localStorage) {
        localStorage.removeItem(PENDING_INVENTORY_SETTINGS_WRITE_KEY);
    }
}

function isTransientInventorySettingsWriteError(error) {
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

function withInventorySettingsWriteTimeout(promise) {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            const error = new Error('Inventory settings save timeout');
            error.code = 'deadline-exceeded';
            reject(error);
        }, INVENTORY_SETTINGS_WRITE_TIMEOUT_MS);
    });

    return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
}

function normalizeInventorySettings(settings) {
    const safeSettings = settings || {};
    return {
        ...safeSettings,
        enabledCategories: Array.isArray(safeSettings.enabledCategories) ? safeSettings.enabledCategories : []
    };
}

function cacheInventorySettings(settings, pendingSync = false) {
    const cached = {
        ...normalizeInventorySettings(settings),
        __pendingSync: pendingSync
    };
    writeCachedRows(INVENTORY_SETTINGS_CACHE_KEY, [cached]);
    return cached;
}

function applyPendingInventorySettings(settings) {
    const pendingWrite = readPendingInventorySettingsWrite();
    if (!pendingWrite || !pendingWrite.data) {
        return settings;
    }

    return cacheInventorySettings({
        ...settings,
        ...pendingWrite.data,
        __pendingSavedAt: pendingWrite.savedAt || ''
    }, true);
}

async function writeInventorySettingsToServer(settings) {
    const normalized = normalizeInventorySettings(settings);
    const docRef = doc(db, 'settings', SETTINGS_DOC);
    await withInventorySettingsWriteTimeout(setDoc(docRef, {
        ...normalized,
        updatedAt: serverTimestamp()
    }, { merge: true }));
    clearPendingInventorySettingsWrite();
    return cacheInventorySettings(normalized, false);
}

export const inventoryService = {
    /**
     * Get inventory records for a specific date (YYYY-MM-DD)
     */
    async getDailyInventory(date) {
        try {
            const q = query(collection(db, COLLECTION), where('date', '==', date));
            const rows = await getDocsWithCache(q, {
                collectionName: COLLECTION,
                cacheKey: `inventory:daily:${date}`,
                timeoutMs: 45000,
                attempts: 2
            });
            const results = {};
            rows.forEach(row => {
                results[row.productId] = row;
            });
            return results;
        } catch (error) {
            console.error("Error fetching daily inventory:", error);
            return {};
        }
    },

    /**
     * Save production record for an item
     */
    async saveProductionRecord(date, productId, data) {
        try {
            const docId = `${date}_${productId}`;
            const docRef = doc(db, COLLECTION, docId);
            const existingSnap = await getDoc(docRef);
            const existingData = existingSnap.exists() ? existingSnap.data() : {};
            const nextData = data || {};
            const totalBaked = Number(nextData.totalBaked !== undefined ? nextData.totalBaked : existingData.totalBaked) || 0;
            const invoiceQuantity = Number(existingData.invoiceQuantity || 0);
            const returnedQuantity = Number(existingData.returnedQuantity || 0);
            await setDoc(docRef, {
                date,
                productId,
                ...nextData, // totalBaked, locked
                totalBaked,
                invoiceQuantity,
                returnedQuantity,
                availableQuantity: totalBaked - invoiceQuantity + returnedQuantity,
                updatedAt: serverTimestamp()
            }, { merge: true });
            return true;
        } catch (error) {
            console.error("Error saving production record:", error);
            return false;
        }
    },

    /**
     * Get inventory-enabled categories
     */
    async getInventorySettings() {
        try {
            if (!offlineStatusService.isOnline()) {
                return applyPendingInventorySettings((await readCachedRowsAsync(INVENTORY_SETTINGS_CACHE_KEY))[0] || { enabledCategories: [] });
            }

            const docRef = doc(db, 'settings', SETTINGS_DOC);
            const snap = await getDoc(docRef);
            const settings = snap.exists() ? snap.data() : { enabledCategories: [] };
            const cached = applyPendingInventorySettings(cacheInventorySettings(settings, false));
            this.flushPendingInventorySettings().catch(error => {
                console.warn('[inventory-settings] Pending settings sync failed.', error);
            });
            return cached;
        } catch (error) {
            console.error("Error fetching inventory settings:", error);
            return applyPendingInventorySettings((await readCachedRowsAsync(INVENTORY_SETTINGS_CACHE_KEY))[0] || { enabledCategories: [] });
        }
    },

    /**
     * Save inventory settings
     */
    async updateInventorySettings(settings) {
        const normalized = normalizeInventorySettings(settings);

        if (!offlineStatusService.isOnline()) {
            writePendingInventorySettingsWrite(normalized);
            cacheInventorySettings(normalized, true);
            return { ok: true, pending: true };
        }

        try {
            await writeInventorySettingsToServer(normalized);
            return { ok: true, pending: false };
        } catch (error) {
            if (!isTransientInventorySettingsWriteError(error)) {
                console.error("Error updating inventory settings:", error);
                return false;
            }
            writePendingInventorySettingsWrite(normalized);
            cacheInventorySettings(normalized, true);
            return { ok: true, pending: true };
        }
    },

    async flushPendingInventorySettings() {
        const pendingWrite = readPendingInventorySettingsWrite();
        if (!pendingWrite || !pendingWrite.data || !offlineStatusService.isOnline()) {
            return false;
        }

        await writeInventorySettingsToServer(normalizeInventorySettings(pendingWrite.data));
        return true;
    }
};

if (typeof window !== 'undefined') {
    window.addEventListener('kyrgyz-organics-online', function() {
        inventoryService.flushPendingInventorySettings().catch(function(error) {
            console.warn('[inventory-settings] Pending settings sync failed.', error);
        });
    });
}


