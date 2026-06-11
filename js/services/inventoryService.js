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
import { getDocsWithCache, readCachedRows, writeCachedRows } from "../core/firestoreRead.js";

const COLLECTION = 'inventory';
const SETTINGS_DOC = 'inventory_settings';
const INVENTORY_SETTINGS_CACHE_KEY = 'inventory:settings';

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
            const docRef = doc(db, 'settings', SETTINGS_DOC);
            const snap = await getDoc(docRef);
            const settings = snap.exists() ? snap.data() : { enabledCategories: [] };
            writeCachedRows(INVENTORY_SETTINGS_CACHE_KEY, [settings]);
            return settings;
        } catch (error) {
            console.error("Error fetching inventory settings:", error);
            return readCachedRows(INVENTORY_SETTINGS_CACHE_KEY)[0] || { enabledCategories: [] };
        }
    },

    /**
     * Save inventory settings
     */
    async updateInventorySettings(settings) {
        try {
            const docRef = doc(db, 'settings', SETTINGS_DOC);
            await setDoc(docRef, {
                ...settings,
                updatedAt: serverTimestamp()
            }, { merge: true });
            writeCachedRows(INVENTORY_SETTINGS_CACHE_KEY, [settings]);
            return true;
        } catch (error) {
            console.error("Error updating inventory settings:", error);
            return false;
        }
    }
};
