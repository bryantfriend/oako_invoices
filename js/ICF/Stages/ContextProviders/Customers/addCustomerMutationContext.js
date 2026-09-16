function addCustomerMutationContext(intent) {
    var state = intent.payload.state.getState();
    intent.context.isAdmin = state.isAdmin === true;
    intent.actor = { id: state.currentUser ? state.currentUser.uid : 'anonymous', role: state.adminProfile ? state.adminProfile.role : 'anonymous' };
    return { ok: true, intent: intent };
}

export default { addCustomerMutationContext: addCustomerMutationContext };
