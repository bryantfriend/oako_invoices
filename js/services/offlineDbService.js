import { openOfflineDexieDatabase } from "./offlineDexieDb.js";

export async function openOfflineDatabase() {
    return openOfflineDexieDatabase();
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
    var database = await openOfflineDexieDatabase();
    if (!database[storeName]) {
        return [];
    }
    return database[storeName].toArray();
}

export async function getRecord(storeName, key) {
    var database = await openOfflineDexieDatabase();
    if (!database[storeName]) {
        return null;
    }
    return database[storeName].get(key);
}

export async function putRecord(storeName, record) {
    var database = await openOfflineDexieDatabase();
    if (!database[storeName]) {
        throw new Error('Offline store is not available: ' + storeName);
    }
    await database[storeName].put(record);
    return record;
}

export async function deleteRecord(storeName, key) {
    var database = await openOfflineDexieDatabase();
    if (!database[storeName]) {
        return true;
    }
    await database[storeName].delete(key);
    return true;
}
