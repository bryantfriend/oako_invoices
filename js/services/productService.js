import { db } from "../core/firebase.js";
import {
    collection,
    getDocs,
    query,
    where,
    orderBy
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const COLLECTION = 'products';

export const productService = {
    async getAllProducts() {
        try {
            // Try to filter by active first, if index exists
            // If not, we might need to fetch all and filter client side or handle the index error
            // For safety in a "drop-in" scenario without knowing their indexes, let's just fetch all
            // and filter client side if the list isn't huge.
            const q = collection(db, COLLECTION);
            const snapshot = await getDocs(q);

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
            });
        } catch (error) {
            console.error("Error fetching products:", error);
            // Fallback for UI if permission denied or other error
            return [];
        }
    }
};
