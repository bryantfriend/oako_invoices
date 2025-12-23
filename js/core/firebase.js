import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

import { firebaseConfig } from "../config.js";

// 🔒 Initialize ONCE
const app = initializeApp(firebaseConfig);

// 🔌 Export shared singletons
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
