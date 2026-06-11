import { db } from "../core/firebase.js";
import {
    collection
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { logCollectionError } from "../core/firestoreDiagnostics.js";
import { getDocsWithCache } from "../core/firestoreRead.js";

const COLLECTION = 'products';
const CATEGORIES_COLLECTION = 'categories';

export const productService = {
    async getAllProducts() {
        try {
            // Try to filter by active first, if index exists
            // If not, we might need to fetch all and filter client side or handle the index error
            // For safety in a "drop-in" scenario without knowing their indexes, let's just fetch all
            // and filter client side if the list isn't huge.
            const q = collection(db, COLLECTION);

            const rows = await getDocsWithCache(q, {
                collectionName: COLLECTION,
                cacheKey: 'products:all',
                timeoutMs: 45000,
                attempts: 2
            });

            return rows.map(row => {
                const data = row || {};
                // heuristics to find the name
                const name = data.name || data.name_en || data.title || data.title_en || 'Unknown Product';
                return {
                    id: data.id,
                    ...data,
                    displayName: name,
                    price: data.price || 0 // Assuming there is a price field, otherwise default to 0
                };
            }).filter(product => product.archived !== true && product.active !== false);
        } catch (error) {
            logCollectionError(COLLECTION, error);
            // Fallback for UI if permission denied or other error
            return [];
        }
    },

    async getAllCategories() {
        try {
            const q = collection(db, CATEGORIES_COLLECTION);
            const rows = await getDocsWithCache(q, {
                collectionName: CATEGORIES_COLLECTION,
                cacheKey: 'categories:all',
                timeoutMs: 45000,
                attempts: 2
            });
            return rows.map(row => {
                const data = row || {};
                return {
                    id: data.id,
                    ...data,
                    name: data.name || data.name_en || 'Unknown Category'
                };
            }).filter(category => category.archived !== true && category.active !== false);
        } catch (error) {
            logCollectionError(CATEGORIES_COLLECTION, error);
            return [];
        }
    }
};
