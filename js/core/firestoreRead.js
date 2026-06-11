import { getDocs, getDocsFromCache } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { createCollectionTimeoutError, logCollectionError } from "./firestoreDiagnostics.js";

const DEFAULT_TIMEOUT_MS = 45000;
const DEFAULT_ATTEMPTS = 2;
const CACHE_PREFIX = 'kyrgyz-organics-read-cache:';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getCacheKey(key) {
    return CACHE_PREFIX + String(key || '').trim();
}

function normalizeCachedRows(rows) {
    return Array.isArray(rows) ? rows : [];
}

function readCachedRows(cacheKey) {
    if (!cacheKey || typeof window === 'undefined' || !window.localStorage) {
        return [];
    }

    try {
        const raw = window.localStorage.getItem(getCacheKey(cacheKey));
        if (!raw) {
            return [];
        }
        const cached = JSON.parse(raw);
        return normalizeCachedRows(cached.rows);
    } catch (error) {
        console.warn('[firestore-read] Could not read cache.', { cacheKey, error });
        return [];
    }
}

function writeCachedRows(cacheKey, rows) {
    if (!cacheKey || typeof window === 'undefined' || !window.localStorage || !Array.isArray(rows)) {
        return;
    }

    try {
        window.localStorage.setItem(getCacheKey(cacheKey), JSON.stringify({
            rows,
            cachedAt: new Date().toISOString()
        }));
    } catch (error) {
        console.warn('[firestore-read] Could not write cache.', { cacheKey, error });
    }
}

async function withTimeout(promise, collectionName, timeoutMs) {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            reject(createCollectionTimeoutError(collectionName, timeoutMs));
        }, timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
}

function mapSnapshotRows(snapshot) {
    return snapshot.docs.map(documentSnapshot => ({
        id: documentSnapshot.id,
        ...documentSnapshot.data()
    }));
}

export async function getDocsWithCache(queryRef, options = {}) {
    const collectionName = options.collectionName || options.cacheKey || 'collection';
    const cacheKey = options.cacheKey || collectionName;
    const timeoutMs = Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS;
    const attempts = Math.max(1, Number(options.attempts) || DEFAULT_ATTEMPTS);
    let lastError = null;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            const snapshot = await withTimeout(getDocs(queryRef), collectionName, timeoutMs);
            const rows = mapSnapshotRows(snapshot);
            writeCachedRows(cacheKey, rows);
            return rows;
        } catch (error) {
            lastError = error;
            logCollectionError(collectionName, error, attempt === 1 ? 'fetch' : `retry ${attempt} fetch`);
            if (attempt < attempts) {
                await sleep(600 * attempt);
            }
        }
    }

    try {
        const cachedSnapshot = await getDocsFromCache(queryRef);
        const rows = mapSnapshotRows(cachedSnapshot);
        writeCachedRows(cacheKey, rows);
        console.warn('[firestore-read] Using Firestore local cache after server read failed.', {
            collection: collectionName,
            cacheKey,
            rows: rows.length,
            message: lastError?.message || ''
        });
        return rows;
    } catch (cacheError) {
        console.warn('[firestore-read] Firestore local cache unavailable after server read failed.', {
            collection: collectionName,
            cacheKey,
            message: cacheError?.message || ''
        });
    }

    const cachedRows = readCachedRows(cacheKey);
    if (cachedRows.length > 0) {
        console.warn('[firestore-read] Using cached rows after Firestore read failed.', {
            collection: collectionName,
            cacheKey,
            rows: cachedRows.length,
            message: lastError?.message || ''
        });
        return cachedRows;
    }

    throw lastError || createCollectionTimeoutError(collectionName, timeoutMs);
}

export {
    readCachedRows,
    writeCachedRows
};
