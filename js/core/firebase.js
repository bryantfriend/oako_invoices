import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { initializeFirestore, memoryLocalCache } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
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

// The app already owns durable offline reads and queued writes through Dexie.
// Keeping Firestore's cache in memory prevents a browser-level IndexedDB failure
// from poisoning Firestore's internal async queue and breaking cloud reads.
export const db = initializeFirestore(app, {
    experimentalForceLongPolling: true,
    localCache: memoryLocalCache()
});

export const storage = getStorage(app);
