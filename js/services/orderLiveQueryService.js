import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { auth, db } from '../core/firebase.js';
import * as firestore from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { store } from '../core/store.js';
import { APP_CONFIG } from '../config.js';
import { createFirebaseOrderStreamAdapter } from '../core/firebaseOrderStreamAdapter.js';
import { readServerSnapshot } from '../core/firestoreServerRead.js';
import { createTripleStreams } from '../core/tripleStreams.mjs';

var publisher = null;
var route = null;
var listeners = new Set();
var lastStatus = { state: 'disabled' };
var sdk = Object.assign({}, firestore, {
    getDocFromServer: function boundedRead(reference) {
        return readServerSnapshot(reference, 15000, function timeout() { return new Error('Order confirmation timed out.'); });
    }
});
var adapter = createFirebaseOrderStreamAdapter(sdk, db);
var streams = createTripleStreams({
    subscribe: adapter.subscribe,
    reconcileMissing: adapter.reconcileMissing,
    publish: function publish(rows, metadata) {
        if (!publisher || !canUse()) return false;
        return publisher(rows, metadata);
    },
    status: function status(value) {
        lastStatus = value;
        listeners.forEach(function notify(listener) { listener(value); });
    }
});

function context() {
    var state = store.getState();
    var user = auth.currentUser;
    var owner = user && state.currentUser && user.uid === state.currentUser.uid && state.authReady && state.isAdmin ? user.uid : null;
    var path = route === null ? (window.location.hash.slice(1) || '/') : route;
    return { owner: APP_CONFIG.LIVE_ORDER_STREAMS_ENABLED ? owner : null,
        active: path === '/', visible: document.visibilityState !== 'hidden' };
}
function canUse() {
    var value = context();
    return Boolean(value.owner && value.active && value.visible);
}
function updateContext() { if (APP_CONFIG.LIVE_ORDER_STREAMS_ENABLED) streams.setContext(context()); }
store.subscribe(updateContext);
onAuthStateChanged(auth, updateContext);
document.addEventListener('visibilitychange', updateContext);
window.addEventListener('hashchange', function changedRoute() { route = null; updateContext(); });

export const orderLiveQueryService = {
    canUse: canUse,
    setRoute: function setRoute(path) { route = path; updateContext(); },
    requestSnapshot: function requestSnapshot() {
        updateContext();
        if (!canUse()) return Promise.reject(new Error('Live Orders is not active for this session.'));
        return streams.requestSnapshot({ timeoutMs: 15000 });
    },
    getSnapshot: function getSnapshot() { return canUse() ? streams.getSnapshot() : null; },
    requestPublish: function requestPublish() { if (canUse()) streams.requestPublish(); },
    setPublisher: function setPublisher(callback) { publisher = callback; },
    getStatus: function getStatus() { return Object.assign({}, lastStatus, { testMode: APP_CONFIG.LIVE_ORDER_STREAMS_TEST_MODE === true }); },
    subscribeStatus: function subscribeStatus(callback) { listeners.add(callback); return function stop() { listeners.delete(callback); }; }
};
