import { auth } from "./firebase.js";
import { store } from "./store.js";

export function getFirestoreAuthState() {
    const state = store.getState();
    const user = auth.currentUser;
    return {
        authReady: state.authReady === true,
        signedIn: !!user,
        uid: user ? user.uid : null,
        isAdmin: state.isAdmin === true,
        role: state.adminProfile ? state.adminProfile.role || null : null
    };
}

export function createCollectionTimeoutError(collectionName, timeoutMs) {
    const error = new Error(`${collectionName} fetch timeout after ${timeoutMs}ms`);
    error.collectionName = collectionName;
    error.authState = getFirestoreAuthState();
    return error;
}

export function logCollectionError(collectionName, error, action = 'fetch') {
    console.error(`Error ${action} ${collectionName}:`, {
        collection: collectionName,
        code: error?.code || '',
        message: error?.message || '',
        authState: error?.authState || getFirestoreAuthState()
    });
}
