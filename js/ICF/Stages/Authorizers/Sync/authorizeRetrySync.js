import resultHelpers from '../../../engine/resultHelpers.js';

function authorizeRetrySync(intent) {
    var session = intent.context.session;
    if (!session.uid || !session.isAdmin || intent.actor.id !== session.uid) {
        return resultHelpers.authorizationFailure('Sign in with the original staff account to retry these changes.');
    }
    for (var item of intent.context.items) {
        if (!item || item.userId !== session.uid) {
            return resultHelpers.authorizationFailure('Only the original user can retry a saved change.');
        }
        var allowed = item.status === 'blocked_authentication' || (intent.payload.mode === 'manual' && item.status === 'failed_terminal');
        if (!allowed || !item.payload || (item.entityType !== 'invoice' && item.entityType !== 'order')) {
            return resultHelpers.authorizationFailure('This change needs conflict review or is already being synchronized.');
        }
    }
    return resultHelpers.success(intent);
}

export default { authorizeRetrySync: authorizeRetrySync };
