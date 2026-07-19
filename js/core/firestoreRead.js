import { getDocs, getDocsFromCache } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { createCollectionTimeoutError, logCollectionError } from "./firestoreDiagnostics.js";
import { openOfflineDexieDatabase } from "../services/offlineDexieDb.js";
import { connectionStateService } from "../services/connectionStateService.js";

const DEFAULT_TIMEOUT_MS = 12000;
const DEFAULT_ATTEMPTS = 1;

const CACHE_PREFIX = 'kyrgyz-organics-read-cache:';
const MAX_LOCAL_CACHE_ENTRY_BYTES = 180000;
const MAX_LOCAL_CACHE_TOTAL_BYTES = 900000;
const DEXIE_CACHE_PREFIX = 'firestore-read:';
const MAX_SERVER_READS = 2;
var activeServerReads = 0;
var queuedServerReads = [];


function getReadPriority(options) {
    if (options && options.priority) {
        return options.priority;
    }
    var collectionName = String(options && options.collectionName ? options.collectionName : '').toLowerCase();
    if (collectionName === 'inventory' || collectionName.indexOf('analytics') !== -1) {
        return 'low';
    }
    return 'current-route';
}

function compareReadPriority(a, b) {
    var weights = {
        'current-route': 0,
        'medium': 1,
        'low': 2
    };
    var left = weights[a.priority] === undefined ? 1 : weights[a.priority];
    var right = weights[b.priority] === undefined ? 1 : weights[b.priority];
    return left - right;
}

function pumpServerReadQueue() {
    if (activeServerReads >= MAX_SERVER_READS || queuedServerReads.length === 0) {
        return;
    }
    queuedServerReads.sort(compareReadPriority);
    var next = queuedServerReads.shift();
    activeServerReads = activeServerReads + 1;
    Promise.resolve()
        .then(next.worker)
        .then(next.resolve)
        .catch(next.reject)
        .finally(function() {
            activeServerReads = activeServerReads - 1;
            pumpServerReadQueue();
        });
}

function enqueueFirestoreRead(worker, options) {
    var priority = getReadPriority(options || {});
    console.info('[RECONNECT_SCHEDULER] running priority=' + priority);
    return new Promise(function(resolve, reject) {
        queuedServerReads.push({
            worker: worker,
            resolve: resolve,
            reject: reject,
            priority: priority
        });
        pumpServerReadQueue();
    });
}
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



function getDexieCacheKey(cacheKey) {
    return DEXIE_CACHE_PREFIX + String(cacheKey || '').trim();
}

async function readDexieCachedEntry(cacheKey) {
    if (!cacheKey) {
        return { rows: [], cachedAt: '' };
    }

    try {
        const database = await openOfflineDexieDatabase();
        if (!database.sessionRecords) {
            return { rows: [], cachedAt: '' };
        }
        const record = await database.sessionRecords.get(getDexieCacheKey(cacheKey));
        if (!record) {
            return { rows: [], cachedAt: '' };
        }
        return {
            rows: normalizeCachedRows(record.records),
            cachedAt: record.extras && record.extras.cachedAt ? record.extras.cachedAt : (record.cachedAt || '')
        };
    } catch (error) {
        console.warn('[firestore-read] Could not read Dexie cache.', { cacheKey, message: error && error.message ? error.message : '' });
        return { rows: [], cachedAt: '' };
    }
}

async function writeDexieCachedRows(cacheKey, rows, cachedAt) {
    if (!cacheKey || !Array.isArray(rows)) {
        return;
    }

    try {
        const database = await openOfflineDexieDatabase();
        if (!database.sessionRecords) {
            return;
        }
        await database.sessionRecords.put({
            cacheKey: getDexieCacheKey(cacheKey),
            ownerKey: 'firestore-read',
            collectionName: 'firestore-read',
            records: normalizeCachedRows(rows),
            extras: { cachedAt: cachedAt || new Date().toISOString() },
            loadedAt: Date.now(),
            cachedAt: cachedAt || new Date().toISOString()
        });
    } catch (error) {
        console.warn('[firestore-read] Could not write Dexie cache.', { cacheKey, message: error && error.message ? error.message : '' });
    }
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
        cachedAt: entry.cachedAt,
        source: entry.cachedAt ? 'localStorage' : ''
    };
}
async function getCachedRowsInfoAsync(cacheKey) {
    const dexieEntry = await readDexieCachedEntry(cacheKey);
    if (dexieEntry.rows.length > 0) {
        return {
            rows: dexieEntry.rows,
            count: dexieEntry.rows.length,
            cachedAt: dexieEntry.cachedAt,
            source: 'dexie'
        };
    }
    const entry = readCachedEntry(cacheKey);
    return {
        rows: entry.rows,
        count: entry.rows.length,
        cachedAt: entry.cachedAt,
        source: entry.cachedAt ? 'localStorage' : ''
    };
}
function readCachedRows(cacheKey) {
    return readCachedEntry(cacheKey).rows;
}
async function readCachedRowsAsync(cacheKey) {
    const dexieEntry = await readDexieCachedEntry(cacheKey);
    if (dexieEntry.rows.length > 0) {
        return dexieEntry.rows;
    }
    return readCachedRows(cacheKey);
}

function writeCachedRows(cacheKey, rows) {
    if (!cacheKey || !Array.isArray(rows)) {
        return;
    }

    const cachedAt = new Date().toISOString();
    writeDexieCachedRows(cacheKey, rows, cachedAt);

    if (typeof window === 'undefined' || !window.localStorage) {
        return;
    }

    const storageKey = getCacheKey(cacheKey);
    const serialized = JSON.stringify({
        rows,
        cachedAt: cachedAt
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

function getConnectionSnapshot() {
    try {
        return connectionStateService.getSnapshot();
    } catch (_) {
        return { browserOnline: true, firestoreReachable: false, mode: 'unknown', checkedAt: '' };
    }
}

function shouldReadCacheFirst(options = {}) {
    if (options.preferServer === true) {
        return false;
    }
    const connection = getConnectionSnapshot();
    return connection.browserOnline === false
        || connection.mode === 'offline'
        || connection.mode === 'degraded'
        || (connection.checkedAt && connection.firestoreReachable !== true);
}

function shouldSkipServerRead(options = {}) {
    if (options.allowServerWhenDegraded === true || options.preferServer === true) {
        return false;
    }
    const connection = getConnectionSnapshot();
    return connection.browserOnline === false || connection.mode === 'offline';
}

async function readRowsFromAnyCache(queryRef, collectionName, cacheKey, reason) {
    const cachedRows = await readCachedRowsAsync(cacheKey);
    if (cachedRows.length > 0) {
        console.warn('[firestore-read] Using cached rows before server read.', {
            collection: collectionName,
            cacheKey,
            rows: cachedRows.length,
            reason: reason || ''
        });
        return { hit: true, rows: cachedRows };
    }

    try {
        const cachedSnapshot = await getDocsFromCache(queryRef);
        const rows = mapSnapshotRows(cachedSnapshot);
        if (rows.length > 0) {
            writeCachedRows(cacheKey, rows);
        }
        return { hit: rows.length > 0, rows };
    } catch (cacheError) {
        return { hit: false, rows: [], error: cacheError };
    }
}
export async function getDocsWithCache(queryRef, options = {}) {
    const collectionName = options.collectionName || options.cacheKey || 'collection';
    const cacheKey = options.cacheKey || collectionName;
    const cacheFirst = shouldReadCacheFirst(options);
    const skipServerRead = shouldSkipServerRead(options);
    const requestedTimeoutMs = Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS;
    const timeoutMs = Math.min(requestedTimeoutMs, DEFAULT_TIMEOUT_MS);
    const attempts = cacheFirst ? 1 : Math.max(1, Math.min(Number(options.attempts) || DEFAULT_ATTEMPTS, DEFAULT_ATTEMPTS));
    let lastError = null;

    if (cacheFirst) {
        const cached = await readRowsFromAnyCache(queryRef, collectionName, cacheKey, 'connection-not-ready');
        if (cached.hit || skipServerRead) {
            return cached.rows;
        }
    }

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            const snapshot = await withTimeout(enqueueFirestoreRead(function() { return getDocs(queryRef); }, options), collectionName, timeoutMs);
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

    const cachedRows = await readCachedRowsAsync(cacheKey);
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
    readCachedRowsAsync,
    getCachedRowsInfo,
    getCachedRowsInfoAsync,
    writeCachedRows
};


