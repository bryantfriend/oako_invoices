import resultHelpers from '../../../engine/resultHelpers.js';
function authorizeInventoryMutation(intent) {
    // Match existing admin-only inventory rules; Firestore verifies the admin document.
    var roles = ['admin', 'owner', 'manager', 'superadmin', 'super_admin'];
    if (!intent.context.inventoryAuthenticated || roles.indexOf(String(intent.actor.role).toLowerCase()) === -1) {
        return resultHelpers.authorizationFailure('Sign in with an inventory administrator account.');
    }
    return resultHelpers.success(intent);
}
export default { authorizeInventoryMutation: authorizeInventoryMutation };
