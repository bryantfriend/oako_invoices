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

export function formatFirestoreAuthState(authState = getFirestoreAuthState()) {
    const state = authState || {};
    return [
        'authReady=' + (state.authReady === true),
        'signedIn=' + (state.signedIn === true),
        'uid=' + (state.uid || 'none'),
        'isAdmin=' + (state.isAdmin === true),
        'role=' + (state.role || 'none')
    ].join(' ');
}

export function createCollectionTimeoutError(collectionName, timeoutMs) {
    const error = new Error(`${collectionName} fetch timeout after ${timeoutMs}ms`);
    error.collectionName = collectionName;
    error.authState = getFirestoreAuthState();
    return error;
}

export function logCollectionError(collectionName, error, action = 'fetch') {
    const authState = error?.authState || getFirestoreAuthState();
    const authSummary = formatFirestoreAuthState(authState);
    const details = {
        collection: collectionName,
        code: error?.code || '',
        message: error?.message || '',
        authSummary,
        authState
    };
    const summary = details.message || details.code || 'unknown Firestore error';
    console.error(`Error ${action} ${collectionName}: ${summary} (${authSummary})`, details);
}
