import { authService } from '../core/authService.js';
import { store } from '../core/store.js';
import { workflowLocalStore } from './workflowLocalStore.js';
import pipeline from '../ICF/engine/pipeline.js';
import effectIntent from '../ICF/Intents/RunWorkflowEffectIntent.js';

var running = false;
var scheduled = false;
var initialized = false;

export function getWorkflowSession() {
    var user = authService.getCurrentUser();
    var state = store.getState();
    return {
        uid: user ? user.uid : '',
        role: state.adminProfile ? state.adminProfile.role : '',
        isAdmin: authService.isAdmin(),
    };
}

async function performEffect(effect) {
    if (effect.kind === 'sheets') {
        var orderModule = await import('./orderService.js');
        var sheetsModule = await import('./googleSheetsService.js');
        var order = await orderModule.orderService.getOrderById(effect.entityId, { committedOnly: true });
        if (!order || (order.createdOffline && order.syncStatus === 'pending'))
            throw new Error('Waiting for the order to synchronize.');
        if (
            effect.expectedAt &&
            (!order.localUpdatedAt ||
                new Date(order.localUpdatedAt).getTime() < new Date(effect.expectedAt).getTime())
        )
            throw new Error('Waiting for the order update to commit.');
        var response = await sheetsModule.googleSheetsService.syncOrderLifecycle(order);
        if (response && response.success === false)
            throw response.error || new Error('Sheets sync needs retrying.');
        return response;
    }
    var rewards = await import('./gamificationService.js');
    return rewards.gamificationService.awardWorkflowAction(effect.action, effect.entityId);
}

async function drainEffects() {
    var session = getWorkflowSession();
    if (running || !session.uid || !session.isAdmin || navigator.onLine === false) return;
    running = true;
    try {
        var effects = workflowLocalStore.list('effects').filter(function (effect) {
            return effect.nextAt <= Date.now();
        });
        for (var index = 0; index < effects.length; index += 1) {
            var effect = effects[index];
            if (getWorkflowSession().uid !== session.uid) break;
            try {
                var intent = effectIntent.createRunWorkflowEffectIntent(
                    { id: session.uid, role: session.role },
                    { effect: effect },
                    {
                        api: { getSession: getWorkflowSession, performEffect: performEffect },
                    },
                );
                var result = await pipeline.run(intent);
                if (!result.ok)
                    throw new Error(
                        (result.errors || [result.reason || 'Background work failed.']).join(' '),
                    );
                if (getWorkflowSession().uid === session.uid) workflowLocalStore.finishEffect(effect);
            } catch (error) {
                if (getWorkflowSession().uid === session.uid) workflowLocalStore.retryEffect(effect, error);
            }
        }
    } finally {
        running = false;
    }
}

async function processEffects() {
    // One worker across tabs where supported; destination writes remain idempotent as well.
    if (navigator.locks && navigator.locks.request)
        return navigator.locks.request('ko-workflow-effects', { ifAvailable: true }, async function (lock) {
            if (lock) await drainEffects();
        });
    return drainEffects();
}

export function wakeWorkflowEffects() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(function () {
        scheduled = false;
        processEffects().catch(function (error) {
            console.warn('Background invoice work will retry.', error);
        });
    }, 100);
}

export function queueWorkflowEffect(kind, entityId, action, expectedAt) {
    var effect = workflowLocalStore.enqueue(kind, entityId, action, expectedAt);
    wakeWorkflowEffects();
    return effect;
}

export function initializeWorkflowEffects() {
    if (initialized) return;
    initialized = true;
    window.addEventListener('online', wakeWorkflowEffects);
    store.subscribe(wakeWorkflowEffects);
    setInterval(wakeWorkflowEffects, 15000);
    wakeWorkflowEffects();
}
