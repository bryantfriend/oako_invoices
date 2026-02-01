import { db } from "../core/firebase.js";
import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    query,
    where,
    orderBy,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const COLLECTION = 'inventory';
const SETTINGS_DOC = 'inventory_settings';

export const inventoryService = {
    /**
     * Get inventory records for a specific date (YYYY-MM-DD)
     */
    async getDailyInventory(date) {
        try {
            const q = query(collection(db, COLLECTION), where('date', '==', date));
            const snapshot = await getDocs(q);
            const results = {};
            snapshot.forEach(doc => {
                results[doc.data().productId] = { id: doc.id, ...doc.data() };
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
            await setDoc(docRef, {
                date,
                productId,
                ...data, // totalBaked, locked
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
            return snap.exists() ? snap.data() : { enabledCategories: [] };
        } catch (error) {
            console.error("Error fetching inventory settings:", error);
            return { enabledCategories: [] };
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
            return true;
        } catch (error) {
            console.error("Error updating inventory settings:", error);
            return false;
        }
    }
};
