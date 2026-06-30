import { db } from "../core/firebase.js";
import {
    collection,
    addDoc,
    getDoc,
    doc,
    updateDoc,
    query,
    orderBy,
    where,
    limit,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { createCollectionTimeoutError, logCollectionError } from "../core/firestoreDiagnostics.js";
import { getDocsWithCache, readCachedRowsAsync } from "../core/firestoreRead.js";
import { offlineStatusService } from "./offlineStatusService.js";

const COLLECTION = 'customers';

function generateCustomerPin() {
    const suffix = Math.floor(10000 + Math.random() * 90000);
    return `1${suffix}`;
}

function normalizeCustomerPin(pinCode) {
    const digits = String(pinCode || '').replace(/\D/g, '');
    if (/^1\d{5}$/.test(digits)) return digits;
    if (/^\d{6}$/.test(digits)) return `1${digits.slice(1)}`;
    return generateCustomerPin();
}

function isCustomerPin(pinCode) {
    return /^1\d{5}$/.test(String(pinCode || ''));
}
function filterActiveCustomers(rows) {
    return (Array.isArray(rows) ? rows : [])
        .filter(d => d.archived !== true)
        .sort((a, b) => (a.companyName || a.name || "").localeCompare(b.companyName || b.name || ""));
}

export const customerService = {
    generateCustomerPin,

    async getAllCustomers() {
        if (!offlineStatusService.isOnline()) {
            return filterActiveCustomers(await readCachedRowsAsync('customers:all'));
        }

        try {
            // Simplified query to avoid index requirements for now
            // We can add filtering/ordering back once index is created in Firebase
            let docs = await getDocsWithCache(collection(db, COLLECTION), {
                collectionName: COLLECTION,
                cacheKey: 'customers:all',
                timeoutMs: 45000,
                attempts: 2
            });
            const customersNeedingPins = docs.filter(customer => !isCustomerPin(customer.pinCode));
            await Promise.all(customersNeedingPins.map(async (customer) => {
                const pinCode = normalizeCustomerPin(customer.pinCode);
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
            return filterActiveCustomers(docs);
        } catch (error) {
            logCollectionError(COLLECTION, error);
            const cachedCustomers = filterActiveCustomers(await readCachedRowsAsync('customers:all'));
            if (cachedCustomers.length) {
                console.warn('Using cached customers after live customer load failed.', error);
                return cachedCustomers;
            }
            if (error?.code === 'permission-denied' || String(error?.message || '').toLowerCase().includes('timeout')) {
                throw error;
            }
            return [];
        }
    },

    async getCustomerById(id) {
        let timeoutId;
        try {
            const docRef = doc(db, COLLECTION, id);
            const timeoutPromise = new Promise((_, reject) => {
                timeoutId = setTimeout(() => reject(createCollectionTimeoutError(COLLECTION, 30000)), 30000);
            });
            const docSnap = await Promise.race([getDoc(docRef), timeoutPromise]);
            if (!docSnap.exists()) return null;

            const customer = { id: docSnap.id, ...docSnap.data() };
            if (!isCustomerPin(customer.pinCode)) {
                const pinCode = normalizeCustomerPin(customer.pinCode);
                customer.pinCode = pinCode;
                await updateDoc(docRef, {
                    pinCode,
                    updatedAt: serverTimestamp()
                }).catch(error => console.warn("Could not normalize customer PIN.", error));
            }
            return customer;
        } catch (error) {
            console.error("Error fetching customer:", error);
            throw error;
        } finally {
            clearTimeout(timeoutId);
        }
    },

    async getCustomerByName(name) {
        const normalizedName = String(name || '').trim().toLowerCase();
        if (!normalizedName) return null;

        const customers = await this.getAllCustomers();
        return customers.find(customer => {
            const companyName = String(customer.companyName || '').trim().toLowerCase();
            const customerName = String(customer.name || '').trim().toLowerCase();
            return companyName === normalizedName || customerName === normalizedName;
        }) || null;
    },

    async createCustomer(data) {
        try {
            const payload = {
                ...data, // name, companyName, phone, email, address, notes
                pinCode: normalizeCustomerPin(data.pinCode),
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
                ...(data.pinCode !== undefined ? { pinCode: normalizeCustomerPin(data.pinCode) } : {}),
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
            return await getDocsWithCache(q, {
                collectionName: COLLECTION,
                cacheKey: `customers:search:${searchTerm}`,
                timeoutMs: 30000,
                attempts: 1
            });
        } catch (error) {
            // Fallback: If index missing or composite query fails, assume empty
            console.warn("Search failed", error);
            return [];
        }
    },

    async deleteCustomer(id) {
        return this.updateCustomer(id, {
            archived: true,
            archivedAt: serverTimestamp()
        });
    }
};
