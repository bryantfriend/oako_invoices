import resultHelpers from '../../../engine/resultHelpers.js';
function authorizeInvoiceWorkflow(intent) {
    var session = intent.context.session || {};
    // Identity comes from the authenticated service, never from the submitted draft.
    if (!session.uid || !session.isAdmin || session.uid !== intent.actor.id)
        return resultHelpers.authorizationFailure('An authorized staff session is required.');
    if (intent.payload.effect && intent.payload.effect.actorId !== session.uid)
        return resultHelpers.authorizationFailure('This background work belongs to another account.');
    return resultHelpers.success(intent);
}
export default { authorizeInvoiceWorkflow: authorizeInvoiceWorkflow };
