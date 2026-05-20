import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { initializeFirestore, memoryLocalCache, persistentLocalCache, persistentMultipleTabManager } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

import { firebaseConfig } from "../config.js";

// 🔒 Initialize ONCE
const app = initializeApp(firebaseConfig);

// 🔌 Export shared singletons
export const auth = getAuth(app);

export const offlinePersistenceState = {
    enabled: false,
    warning: ''
};

let firestoreInstance;

try {
    // Firestore persistence is the read cache. Offline writes are staged separately
    // in IndexedDB so the app can sync and run Google Sheets side effects in order.
    firestoreInstance = initializeFirestore(app, {
        experimentalForceLongPolling: true,
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
    });
    offlinePersistenceState.enabled = true;
} catch (error) {
    console.warn("Firestore persistent cache unavailable; falling back to memory cache.", error);
    offlinePersistenceState.warning = 'Offline cache is limited in this browser session.';
    firestoreInstance = initializeFirestore(app, {
        experimentalForceLongPolling: true,
        localCache: memoryLocalCache()
    });
}

export const db = firestoreInstance;

export const storage = getStorage(app);
