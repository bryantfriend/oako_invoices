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

function generateCustomerPin() {
    const pin = Math.floor(100000 + Math.random() * 900000);
    return String(pin);
}

export const customerService = {
    generateCustomerPin,

    async getAllCustomers() {
        let timeoutId;
        try {
            // Simplified query to avoid index requirements for now
            // We can add filtering/ordering back once index is created in Firebase
            const timeoutPromise = new Promise((_, reject) => {
                timeoutId = setTimeout(() => reject(new Error('Customers fetch timeout')), 30000);
            });
            const snapshot = await Promise.race([getDocs(collection(db, COLLECTION)), timeoutPromise]);
            let docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const customersMissingPins = docs.filter(customer => !customer.pinCode);
            await Promise.all(customersMissingPins.map(async (customer) => {
                const pinCode = generateCustomerPin();
                customer.pinCode = pinCode;
                try {
                    await updateDoc(doc(db, COLLECTION, customer.id), {
                        pinCode,
                        updatedAt: serverTimestamp()
                    });
                } catch (error) {
                    console.warn("Could not save generated customer PIN.", error);
                }
            }));

            // Client-side filter and sort as a fallback
            return docs
                .filter(d => d.archived !== true)
                .sort((a, b) => (a.companyName || a.name || "").localeCompare(b.companyName || b.name || ""));
        } catch (error) {
            console.error("Error fetching customers:", error);
            return [];
        } finally {
            clearTimeout(timeoutId);
        }
    },

    async getCustomerById(id) {
        let timeoutId;
        try {
            const docRef = doc(db, COLLECTION, id);
            const timeoutPromise = new Promise((_, reject) => {
                timeoutId = setTimeout(() => reject(new Error('Customer fetch timeout')), 30000);
            });
            const docSnap = await Promise.race([getDoc(docRef), timeoutPromise]);
            return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
        } catch (error) {
            console.error("Error fetching customer:", error);
            throw error;
        } finally {
            clearTimeout(timeoutId);
        }
    },

    async createCustomer(data) {
        try {
            const payload = {
                ...data, // name, companyName, phone, email, address, notes
                pinCode: data.pinCode || generateCustomerPin(),
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
