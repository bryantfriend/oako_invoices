import { createSaveInventoryDefaultsIntent } from '../ICF/Intents/SaveInventoryDefaultsIntent.js';
import { validateInventoryEntry, parseProductionQuantity } from '../core/inventoryValidation.js';
import icfPipeline from '../ICF/engine/pipeline.js';
import { createSaveProductionRecordIntent } from '../ICF/Intents/SaveProductionRecordIntent.js';
import { createSetInventoryLockStatusIntent } from '../ICF/Intents/SetInventoryLockStatusIntent.js';
import { createInitializeInventoryDayIntent } from '../ICF/Intents/InitializeInventoryDayIntent.js';
import { createImportInventoryDayIntent } from '../ICF/Intents/ImportInventoryDayIntent.js';
import { db } from "../core/firebase.js";
import {
    collection,
    doc,
    getDoc,
    setDoc,
    runTransaction,
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

var pendingProductWrites = new Map();

async function writeProductionRecord(date, productId, data, onlyUninitialized) {
    validateInventoryEntry(date, productId, data);
    var key = date + '_' + productId;
    var previous = pendingProductWrites.get(key) || Promise.resolve();
    var pending = previous.catch(function ignorePreviousFailure() {}).then(async function saveAfterPrevious() {
        var reference = doc(db, COLLECTION, key);
        await runTransaction(db, async function saveTransaction(transaction) {
            var snapshot = await transaction.get(reference);
            var existing = snapshot.exists() ? snapshot.data() : {};
            if (onlyUninitialized && existing.totalBaked !== undefined) {
                throw new Error('This product was already initialized. Refresh to review its current quantity.');
            }
            var patch = { date: date, productId: productId, updatedAt: serverTimestamp() };
            if (data.locked !== undefined) patch.locked = data.locked;
            else if (existing.locked === undefined) patch.locked = false;
            if (data.totalBaked !== undefined) {
                if (existing.locked === true) throw new Error('Unlock this product before changing its baked quantity.');
                patch.totalBaked = parseProductionQuantity(data.totalBaked);
                patch.availableQuantity = patch.totalBaked - Number(existing.invoiceQuantity || 0) + Number(existing.returnedQuantity || 0);
                if (!Number.isFinite(patch.availableQuantity)) throw new Error('Inventory counters need review before saving.');
            } else if (existing.totalBaked === undefined) {
                // A new lock record must satisfy the existing Firestore schema.
                patch.totalBaked = 0;
                patch.availableQuantity = -Number(existing.invoiceQuantity || 0) + Number(existing.returnedQuantity || 0);
            }
            // Counter fields belong to invoice transactions and are never copied back.
            transaction.set(reference, patch, { merge: true });
        });
        return true;
    });
    pendingProductWrites.set(key, pending);
    try { return await pending; }
    finally { if (pendingProductWrites.get(key) === pending) pendingProductWrites.delete(key); }
}

async function writeInventoryDefaults(entries) {
    var savedSettings;
    await runTransaction(db, async function saveDefaultsTransaction(transaction) {
        var reference = doc(db, 'settings', SETTINGS_DOC);
        var snapshot = await transaction.get(reference);
        var existing = snapshot.exists() ? snapshot.data() : {};
        var defaults = Object.assign({}, existing.defaultProductionQuantities || {});
        entries.forEach(function applyDefault(entry) {
            Object.defineProperty(defaults, entry.productId, { value: parseProductionQuantity(entry.data.totalBaked), enumerable: true, configurable: true, writable: true });
        });
        transaction.set(reference, { defaultProductionQuantities: defaults, updatedAt: serverTimestamp() }, { merge: true });
        savedSettings = Object.assign({}, existing, { defaultProductionQuantities: defaults });
    });
    cacheInventorySettings(savedSettings, false);
}

async function runInventoryMutation(factory, date, entries, onlyUninitialized, writeDefaults) {
    var result = await icfPipeline.run(factory({ date: date, entries: entries, writeRecord: writeProductionRecord, onlyUninitialized: onlyUninitialized, writeDefaults: writeDefaults }));
    if (!result || !result.ok) {
        throw new Error(result && result.errors ? result.errors.join(' ') : 'Inventory operation failed.');
    }
    return result.intent.context.resultData;
}

export const inventoryService = {
    /**
     * Get inventory records for a specific date (YYYY-MM-DD)
     */
    async getDailyInventory(date, options) {
        var source = 'cache';
        var rows = await getDocsWithCache(query(collection(db, COLLECTION), where('date', '==', date)), {
            collectionName: COLLECTION, cacheKey: 'inventory:daily:' + date, timeoutMs: 45000, attempts: 2,
            preferServer: Boolean(options && options.forceRefresh),
            onReadSource: function recordSource(value) { source = value; }
        });
        if (source !== 'server' && rows.length === 0) throw new Error('Could not confirm inventory for this day. Reconnect and retry.');
        var results = {};
        rows.forEach(function collectRecord(row) { results[row.productId] = row; });
        Object.defineProperty(results, '__readSource', { value: source });
        return results;
    },

    async saveProductionRecord(date, productId, data) {
        var result = await runInventoryMutation(createSaveProductionRecordIntent, date, [{ productId: productId, data: data }], false);
        if (!result.ok) throw new Error(result.failed[0].error);
        return true;
    },

    async saveStartingQuantities(date, entries) {
        return runInventoryMutation(createSaveInventoryDefaultsIntent, date, entries, false, writeInventoryDefaults);
    },

    async setLockStatus(date, entries) {
        return runInventoryMutation(createSetInventoryLockStatusIntent, date, entries, false);
    },

    async initializeDay(date, entries) {
        return runInventoryMutation(createInitializeInventoryDayIntent, date, entries, true);
    },

    async importDay(date, entries) {
        return runInventoryMutation(createImportInventoryDayIntent, date, entries, true);
    },

    /**
     * Get inventory-enabled categories
     */
    async getInventorySettings(options) {
        try {
            if (!offlineStatusService.isOnline()) {
                var cachedSettings = (await readCachedRowsAsync(INVENTORY_SETTINGS_CACHE_KEY))[0];
                if (!cachedSettings && options && options.requireAvailable) throw new Error('Inventory settings are unavailable. Reconnect and retry.');
                return Object.assign({}, applyPendingInventorySettings(cachedSettings || { enabledCategories: [] }), { __stale: true });
            }

            const docRef = doc(db, 'settings', SETTINGS_DOC);
            const snap = await getDoc(docRef);
            const settings = snap.exists() ? snap.data() : { enabledCategories: [] };
            const cached = applyPendingInventorySettings(cacheInventorySettings(settings, false));
            this.flushPendingInventorySettings().catch(error => {
                console.warn('[inventory-settings] Pending settings sync failed.', error);
            });
            if (snap.metadata && snap.metadata.fromCache) return Object.assign({}, cached, { __stale: true });
            return cached;
        } catch (error) {
            console.error("Error fetching inventory settings:", error);
            var cachedSettings = (await readCachedRowsAsync(INVENTORY_SETTINGS_CACHE_KEY))[0];
                if (!cachedSettings && options && options.requireAvailable) throw new Error('Inventory settings are unavailable. Reconnect and retry.');
                return Object.assign({}, applyPendingInventorySettings(cachedSettings || { enabledCategories: [] }), { __stale: true });
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


