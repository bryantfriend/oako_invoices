import { authService } from '../core/authService.js';
import { createWorkflowId } from '../core/invoiceProductivity.js';

function owner() {
    var user = authService.getCurrentUser();
    if (!user) throw new Error('Sign in to save your invoice workspace.');
    return user.uid;
}

function key(kind, id, actorId) {
    return 'ko-workflow:' + (actorId || owner()) + ':' + kind + ':' + id;
}

export const workflowLocalStore = {
    read: function (kind, id, fallback) {
        try {
            return JSON.parse(localStorage.getItem(key(kind, id))) || fallback;
        } catch (error) {
            return fallback;
        }
    },
    write: function (kind, id, value) {
        // A failed durable write is visible to the caller. Never claim draft recovery silently.
        localStorage.setItem(key(kind, id), JSON.stringify(value));
        return value;
    },
    remove: function (kind, id) {
        localStorage.removeItem(key(kind, id));
    },
    list: function (kind) {
        var prefix = key(kind, '');
        var rows = [];
        for (var index = 0; index < localStorage.length; index += 1) {
            var storageKey = localStorage.key(index);
            if (storageKey.indexOf(prefix) !== 0) continue;
            try {
                rows.push(JSON.parse(localStorage.getItem(storageKey)));
            } catch (error) {
                /* Ignore a damaged optional record. */
            }
        }
        return rows.filter(Boolean);
    },
    preference: function () {
        return this.read('preferences', 'desk', {
            layout: 'full',
            fun: false,
            sound: false,
            motion: true,
            compact: true,
        });
    },
    event: function (type, details) {
        try {
            var events = this.read('metrics', 'recent', []);
            var cutoff = Date.now() - 30 * 86400000;
            events = events
                .filter(function (event) {
                    return event.at >= cutoff;
                })
                .slice(-999);
            events.push(Object.assign({}, details || {}, { type: type, at: Date.now() }));
            this.write('metrics', 'recent', events);
        } catch (error) {
            console.warn('Workflow timing could not be saved.', error);
        }
    },
    enqueue: function (kind, entityId, action, expectedAt) {
        var id = kind + '-' + (action || '') + '-' + entityId;
        var existing = this.read('effects', id, null);
        if (kind === 'invoice-sheets' && existing) {
            return existing;
        }
        var record = {
            id: id,
            kind: kind,
            entityId: entityId,
            action: action || '',
            expectedAt: expectedAt || '',
            actorId: owner(),
            revision: createWorkflowId(),
            attempts: 0,
            nextAt: 0,
        };
        this.write('effects', id, record);
        return record;
    },
    finishEffect: function (effect) {
        var current = this.read('effects', effect.id, null);
        if (current && current.revision === effect.revision) {
            if (effect.kind === 'invoice-sheets') {
                current.needsReview = false;
                current.nextAt = Number.MAX_SAFE_INTEGER;
                current.acknowledged = true;
                current.error = '';
                current.errorCode = '';
                this.write('effects', effect.id, current);
            } else {
                this.remove('effects', effect.id);
            }
        }
    },
    markEffectSending: function(effect) {
        var current = this.read('effects', effect.id, null);
        if (!current || current.revision !== effect.revision) {
            throw new Error('The export changed before it could be sent.');
        }
        // Persist before sending. If the tab closes after delivery but before a
        // receipt is stored, reopening must not blindly append the invoice again.
        current.needsReview = true;
        current.errorCode = 'sheets_delivery_interrupted';
        current.error = 'An export started without a saved delivery receipt. Check the destination before resending.';
        this.write('effects', effect.id, current);
    },
    holdEffect: function(effect, result) {
        var current = this.read('effects', effect.id, null);
        if (!current || current.revision !== effect.revision) {
            return;
        }
        current.needsReview = true;
        current.errorCode = result.code || 'sheets_review_required';
        current.error = result.message || 'Check Sheets configuration and delivery.';
        current.attempts += 1;
        this.write('effects', effect.id, current);
    },
    retryEffect: function (effect, error) {
        var current = this.read('effects', effect.id, null);
        if (!current || current.revision !== effect.revision) return;
        current.attempts += 1;
        current.error = error.message || 'Background work needs another attempt.';
        current.errorCode = error.code || error.name || 'workflow_retry';
        current.nextAt = Date.now() + Math.min(300000, 2000 * Math.pow(2, Math.min(current.attempts, 8)));
        this.write('effects', effect.id, current);
    },
};
