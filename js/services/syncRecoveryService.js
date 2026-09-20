import { auth } from '../core/firebase.js';
import { authService } from '../core/authService.js';
import { offlineQueueService } from './offlineQueueService.js';
import pipeline from '../ICF/engine/pipeline.js';
import retryIntent from '../ICF/Intents/RetrySyncItemsIntent.js';

var lastAuthenticationAttempt = {};

function getSession() {
    return { uid: auth.currentUser ? auth.currentUser.uid : '', isAdmin: authService.isAdmin() };
}

async function verifyAuthentication(actorId) {
    var user = auth.currentUser;
    if (!user || user.uid !== actorId || !authService.isAdmin()) {
        throw new Error('Sign in with the original staff account.');
    }
    await user.getIdToken(true);
    if (!auth.currentUser || auth.currentUser.uid !== actorId || !authService.isAdmin()) {
        throw new Error('The signed-in account changed.');
    }
}

async function retryItems(itemIds, mode) {
    var session = getSession();
    var intent = retryIntent.createRetrySyncItemsIntent(
        { id: session.uid, role: 'admin' }, { itemIds: itemIds, mode: mode },
        {
            getSession: getSession,
            loadItems: async function(ids) {
                return Promise.all(ids.map(function(id) { return offlineQueueService.getQueueItem(id); }));
            },
            verifyAuthentication: verifyAuthentication,
            requeue: offlineQueueService.requeueOwnedItems
        }
    );
    var result = await pipeline.run(intent);
    if (!result.ok) {
        throw new Error((result.errors || ['These changes could not be retried.']).join('; '));
    }
    return result.data;
}

async function recoverAuthentication() {
    var session = getSession();
    if (!session.uid || !session.isAdmin || Date.now() - (lastAuthenticationAttempt[session.uid] || 0) < 60000) {
        return;
    }
    var items = await offlineQueueService.listActiveItems();
    var blocked = items.filter(function(item) {
        return item.userId === session.uid && item.status === 'blocked_authentication';
    }).slice(0, 100);
    if (blocked.length === 0) {
        return;
    }
    lastAuthenticationAttempt[session.uid] = Date.now();
    await retryItems(blocked.map(function(item) { return item.id; }), 'authentication');
}

export const syncRecoveryService = { retryItems: retryItems, recoverAuthentication: recoverAuthentication };
