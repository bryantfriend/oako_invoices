import resultHelpers from '../../../engine/resultHelpers.js';
import { auth } from '../../../../core/firebase.js';
import { store } from '../../../../core/store.js';
function addInventoryMutationContext(intent) {
    var state = store.getState();
    var user = auth.currentUser || state.currentUser;
    var profile = state.adminProfile || {};
    intent.actor = { id: user ? user.uid || user.email : 'anonymous', role: user ? profile.role || 'admin' : 'anonymous' };
    intent.context.inventoryAuthenticated = Boolean(user);
    intent.context.inventoryStartedAt = Date.now();
    return resultHelpers.success(intent);
}
export default { addInventoryMutationContext: addInventoryMutationContext };
