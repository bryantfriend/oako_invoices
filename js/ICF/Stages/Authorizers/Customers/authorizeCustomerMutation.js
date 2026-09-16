function authorizeCustomerMutation(intent) {
    // Match Firestore staff permissions; database rules remain authoritative.
    var roles = ['admin', 'superadmin', 'owner', 'manager', 'super_admin'];
    if (!intent.context.isAdmin || intent.actor.id === 'anonymous' || roles.indexOf(intent.actor.role) === -1) return { ok: false, errors: ['Sign in with an authorized staff account to change customers.'] };
    return { ok: true, intent: intent };
}

export default { authorizeCustomerMutation: authorizeCustomerMutation };
