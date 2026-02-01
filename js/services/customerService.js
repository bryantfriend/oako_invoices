import { db } from "../core/firebase.js";
import {
    collection,
    addDoc,
    getDocs,
    getDoc,
    doc,
    updateDoc,
    deleteDoc,
    query,
    orderBy,
    where,
    limit,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const COLLECTION = 'customers';

export const customerService = {
    async getAllCustomers() {
        try {
            // Simplified query to avoid index requirements for now
            // We can add filtering/ordering back once index is created in Firebase
            const snapshot = await getDocs(collection(db, COLLECTION));
            let docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Client-side filter and sort as a fallback
            return docs
                .filter(d => d.archived !== true)
                .sort((a, b) => (a.companyName || a.name || "").localeCompare(b.companyName || b.name || ""));
        } catch (error) {
            console.error("Error fetching customers:", error);
            return [];
        }
    },

    async getCustomerById(id) {
        try {
            const docRef = doc(db, COLLECTION, id);
            const docSnap = await getDoc(docRef);
            return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
        } catch (error) {
            console.error("Error fetching customer:", error);
            throw error;
        }
    },

    async createCustomer(data) {
        try {
            const payload = {
                ...data, // name, companyName, phone, email, address, notes
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            };
            const docRef = await addDoc(collection(db, COLLECTION), payload);
            return docRef.id;
        } catch (error) {
            console.error("Error creating customer:", error);
            throw error;
        }
    },

    async updateCustomer(id, data) {
        try {
            const docRef = doc(db, COLLECTION, id);
            await updateDoc(docRef, {
                ...data,
                updatedAt: serverTimestamp()
            });
            return true;
        } catch (error) {
            console.error("Error updating customer:", error);
            throw error;
        }
    },

    async searchCustomers(searchTerm) {
        // Basic search by name (prefix) - Firestore is limited in search
        // Ideally use a specialized search service, but for small datasets client-side filtering 
        // or simple prefix match works.
        try {
            const q = query(
                collection(db, COLLECTION),
                where('name', '>=', searchTerm),
                where('name', '<=', searchTerm + '\uf8ff'),
                limit(10)
            );
            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            // Fallback: If index missing or composite query fails, assume empty
            console.warn("Search failed", error);
            return [];
        }
    },

    async deleteCustomer(id) {
        try {
            const docRef = doc(db, COLLECTION, id);
            await deleteDoc(docRef);
            return true;
        } catch (error) {
            console.error("Error deleting customer:", error);
            throw error;
        }
    }
};
