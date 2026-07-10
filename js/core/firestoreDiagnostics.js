import { auth } from "./firebase.js";
import { store } from "./store.js";

var timeoutSummaryByScope = {};
var TIMEOUT_SUMMARY_WINDOW_MS = 30000;

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
    const lowerSummary = String(summary || '').toLowerCase();
    if (lowerSummary.indexOf('timeout') !== -1) {
        const key = collectionName + ':' + action;
        const now = Date.now();
        const current = timeoutSummaryByScope[key] || { count: 0, startedAt: now, lastLoggedAt: 0 };
        current.count = current.count + 1;
        if (now - current.startedAt > TIMEOUT_SUMMARY_WINDOW_MS) {
            console.warn('[NETWORK_TIMEOUT_SUMMARY] ' + collectionName + ' ' + action + ' timed out ' + current.count + ' times in 30s, using cache.', details);
            timeoutSummaryByScope[key] = { count: 0, startedAt: now, lastLoggedAt: now };
            return;
        }
        timeoutSummaryByScope[key] = current;
        if (current.count === 1) {
            console.warn('[NETWORK_TIMEOUT_SUMMARY] ' + collectionName + ' ' + action + ' timed out, using cache.', details);
        }
        return;
    }
    console.error(`Error ${action} ${collectionName}: ${summary} (${authSummary})`, details);
}
