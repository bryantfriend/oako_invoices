import { db } from "../core/firebase.js";
import {
    collection,
    getDocs,
    query,
    where,
    orderBy
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { createCollectionTimeoutError, logCollectionError } from "../core/firestoreDiagnostics.js";

const COLLECTION = 'products';
const CATEGORIES_COLLECTION = 'categories';

export const productService = {
    async getAllProducts() {
        let timeoutId;
        try {
            // Try to filter by active first, if index exists
            // If not, we might need to fetch all and filter client side or handle the index error
            // For safety in a "drop-in" scenario without knowing their indexes, let's just fetch all
            // and filter client side if the list isn't huge.
            const q = collection(db, COLLECTION);

            // Added timeout wrapper to prevent hanging offline
            const timeoutPromise = new Promise((_, reject) => {
                timeoutId = setTimeout(() => reject(createCollectionTimeoutError(COLLECTION, 30000)), 30000);
            });
            const snapshot = await Promise.race([getDocs(q), timeoutPromise]);

            return snapshot.docs.map(doc => {
                const data = doc.data();
                // heuristics to find the name
                const name = data.name || data.name_en || data.title || data.title_en || 'Unknown Product';
                return {
                    id: doc.id,
                    ...data,
                    displayName: name,
                    price: data.price || 0 // Assuming there is a price field, otherwise default to 0
                };
            }).filter(product => product.archived !== true && product.active !== false);
        } catch (error) {
            logCollectionError(COLLECTION, error);
            // Fallback for UI if permission denied or other error
            return [];
        } finally {
            clearTimeout(timeoutId);
        }
    },

    async getAllCategories() {
        let timeoutId;
        try {
            const q = collection(db, CATEGORIES_COLLECTION);
            const timeoutPromise = new Promise((_, reject) => {
                timeoutId = setTimeout(() => reject(createCollectionTimeoutError(CATEGORIES_COLLECTION, 30000)), 30000);
            });
            const snapshot = await Promise.race([getDocs(q), timeoutPromise]);
            return snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    name: data.name || data.name_en || 'Unknown Category'
                };
            }).filter(category => category.archived !== true && category.active !== false);
        } catch (error) {
            logCollectionError(CATEGORIES_COLLECTION, error);
            return [];
        } finally {
            clearTimeout(timeoutId);
        }
    }
};
