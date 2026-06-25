import { getDocs, getDocsFromCache } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { createCollectionTimeoutError, logCollectionError } from "./firestoreDiagnostics.js";

const DEFAULT_TIMEOUT_MS = 45000;
const DEFAULT_ATTEMPTS = 2;
const CACHE_PREFIX = 'kyrgyz-organics-read-cache:';
const MAX_LOCAL_CACHE_ENTRY_BYTES = 180000;
const MAX_LOCAL_CACHE_TOTAL_BYTES = 900000;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getCacheKey(key) {
    return CACHE_PREFIX + String(key || '').trim();
}

function getStorageEntries() {
    if (typeof window === 'undefined' || !window.localStorage) {
        return [];
    }

    const entries = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
        const key = window.localStorage.key(index);
        if (!key || !key.startsWith(CACHE_PREFIX)) {
            continue;
        }

        const value = window.localStorage.getItem(key) || '';
        let cachedAt = '';
        try {
            cachedAt = JSON.parse(value).cachedAt || '';
        } catch (_) {
            cachedAt = '';
        }
        entries.push({
            key,
            bytes: key.length + value.length,
            cachedAt
        });
    }
    return entries;
}

function pruneCacheStorage(targetBytes = MAX_LOCAL_CACHE_TOTAL_BYTES) {
    if (typeof window === 'undefined' || !window.localStorage) {
        return;
    }

    const entries = getStorageEntries().sort((a, b) => {
        return String(a.cachedAt || '').localeCompare(String(b.cachedAt || ''));
    });
    let totalBytes = entries.reduce((sum, entry) => sum + entry.bytes, 0);

    for (let index = 0; index < entries.length && totalBytes > targetBytes; index += 1) {
        window.localStorage.removeItem(entries[index].key);
        totalBytes -= entries[index].bytes;
    }
}

function normalizeCachedRows(rows) {
    return Array.isArray(rows) ? rows : [];
}


function readCachedEntry(cacheKey) {
    if (!cacheKey || typeof window === 'undefined' || !window.localStorage) {
        return { rows: [], cachedAt: '' };
    }

    try {
        const raw = window.localStorage.getItem(getCacheKey(cacheKey));
        if (!raw) {
            return { rows: [], cachedAt: '' };
        }
        const cached = JSON.parse(raw);
        return {
            rows: normalizeCachedRows(cached.rows),
            cachedAt: cached.cachedAt || ''
        };
    } catch (error) {
        console.warn('[firestore-read] Could not read cache metadata.', { cacheKey, error });
        return { rows: [], cachedAt: '' };
    }
}

function getCachedRowsInfo(cacheKey) {
    const entry = readCachedEntry(cacheKey);
    return {
        rows: entry.rows,
        count: entry.rows.length,
        cachedAt: entry.cachedAt
    };
}
function readCachedRows(cacheKey) {
    return readCachedEntry(cacheKey).rows;
}

function writeCachedRows(cacheKey, rows) {
    if (!cacheKey || typeof window === 'undefined' || !window.localStorage || !Array.isArray(rows)) {
        return;
    }

    const storageKey = getCacheKey(cacheKey);
    const serialized = JSON.stringify({
        rows,
        cachedAt: new Date().toISOString()
    });

    if (serialized.length > MAX_LOCAL_CACHE_ENTRY_BYTES) {
        window.localStorage.removeItem(storageKey);
        pruneCacheStorage();
        return;
    }

    try {
        pruneCacheStorage(MAX_LOCAL_CACHE_TOTAL_BYTES - serialized.length);
        window.localStorage.setItem(storageKey, serialized);
    } catch (error) {
        if (error && (error.name === 'QuotaExceededError' || error.code === 22)) {
            pruneCacheStorage(Math.floor(MAX_LOCAL_CACHE_TOTAL_BYTES / 2));
            try {
                window.localStorage.setItem(storageKey, serialized);
            } catch (_) {
                window.localStorage.removeItem(storageKey);
            }
            return;
        }
        console.debug('[firestore-read] Skipped local fallback cache write.', { cacheKey, message: error?.message || '' });
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
    getCachedRowsInfo,
    writeCachedRows
};
