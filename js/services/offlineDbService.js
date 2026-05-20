const DATABASE_NAME = 'kyrgyz-organics-offline-v1';
const DATABASE_VERSION = 1;

let databasePromise = null;

function createStoreIfMissing(database, name, options) {
    if (!database.objectStoreNames.contains(name)) {
        return database.createObjectStore(name, options);
    }
    return null;
}

function createIndexIfMissing(store, name, keyPath) {
    if (store && !store.indexNames.contains(name)) {
        store.createIndex(name, keyPath, { unique: false });
    }
}

function upgradeDatabase(database) {
    const queueStore = createStoreIfMissing(database, 'queue', { keyPath: 'id' });
    createIndexIfMissing(queueStore, 'status', 'status');
    createIndexIfMissing(queueStore, 'createdAtLocal', 'createdAtLocal');
    createIndexIfMissing(queueStore, 'entityId', 'entityId');

    createStoreIfMissing(database, 'metadata', { keyPath: 'key' });

    const conflictStore = createStoreIfMissing(database, 'conflicts', { keyPath: 'id' });
    createIndexIfMissing(conflictStore, 'entityId', 'entityId');
    createIndexIfMissing(conflictStore, 'status', 'status');
}

export function openOfflineDatabase() {
    if (databasePromise) {
        return databasePromise;
    }

    databasePromise = new Promise(function(resolve, reject) {
        if (!window.indexedDB) {
            reject(new Error('IndexedDB is not available in this browser.'));
            return;
        }

        const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

        request.onupgradeneeded = function(event) {
            upgradeDatabase(event.target.result);
        };

        request.onsuccess = function(event) {
            resolve(event.target.result);
        };

        request.onerror = function(event) {
            reject(event.target.error || new Error('Could not open offline database.'));
        };
    });

    return databasePromise;
}

export function requestToPromise(request) {
    return new Promise(function(resolve, reject) {
        request.onsuccess = function(event) {
            resolve(event.target.result);
        };
        request.onerror = function(event) {
            reject(event.target.error || new Error('IndexedDB request failed.'));
        };
    });
}

export async function getAllFromStore(storeName) {
    const database = await openOfflineDatabase();
    const transaction = database.transaction(storeName, 'readonly');
    return requestToPromise(transaction.objectStore(storeName).getAll());
}

export async function getRecord(storeName, key) {
    const database = await openOfflineDatabase();
    const transaction = database.transaction(storeName, 'readonly');
    return requestToPromise(transaction.objectStore(storeName).get(key));
}

export async function putRecord(storeName, record) {
    const database = await openOfflineDatabase();
    const transaction = database.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    await requestToPromise(store.put(record));
    return record;
}

export async function deleteRecord(storeName, key) {
    const database = await openOfflineDatabase();
    const transaction = database.transaction(storeName, 'readwrite');
    await requestToPromise(transaction.objectStore(storeName).delete(key));
    return true;
}
