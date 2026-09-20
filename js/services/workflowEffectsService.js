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
    if (effect.kind === 'invoice-sheets') {
        var invoiceModule = await import('./invoiceService.js');
        var invoiceSheetsModule = await import('./googleSheetsService.js');
        var invoice = await invoiceModule.invoiceService.getCommittedInvoiceSnapshot(effect.entityId);
        if (!invoice) {
            return { success: false, needsReview: true, code: 'not-found', message: 'The invoice for this Sheets export could not be found. Review the saved record before retrying.' };
        }
        workflowLocalStore.markEffectSending(effect);
        return invoiceSheetsModule.googleSheetsService.syncCompletedInvoice(invoice, { deliveryId: effect.id + ':' + effect.revision });
    }
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
        workflowLocalStore.markEffectSending(effect);
        var response = await sheetsModule.googleSheetsService.syncOrderLifecycle(order, { deliveryId: effect.id + ':' + effect.revision });
        if (response && response.success === false && !response.needsReview)
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
            return !effect.needsReview && effect.nextAt <= Date.now();
        });
        for (var index = 0; index < effects.length; index += 1) {
            var effect = effects[index];
            if (getWorkflowSession().uid !== session.uid) break;
            var effectError = null;
            try {
                var intent = effectIntent.createRunWorkflowEffectIntent(
                    { id: session.uid, role: session.role },
                    { effect: effect },
                    {
                        api: {
                            getSession: getWorkflowSession,
                            performEffect: async function runEffectWithErrorDetails(nextEffect) {
                                try {
                                    return await performEffect(nextEffect);
                                } catch (error) {
                                    effectError = error;
                                    throw error;
                                }
                            }
                        },
                    },
                );
                var result = await pipeline.run(intent);
                if (!result.ok)
                    throw effectError || new Error(
                        (result.errors || [result.reason || 'Background work failed.']).join(' '),
                    );
                if (getWorkflowSession().uid === session.uid) {
                    if (result.data && result.data.needsReview) {
                        workflowLocalStore.holdEffect(effect, result.data);
                    } else {
                        workflowLocalStore.finishEffect(effect);
                    }
                }
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
