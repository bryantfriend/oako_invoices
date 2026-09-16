function emitCustomerMutation(intent) {
    var archived = intent.type === 'ArchiveCustomerIntent';
    intent.context.events = [{ type: archived ? 'CustomerArchived' : 'CustomerUpdated', customerId: intent.payload.customerId }];
    // A slow or failed reward must never block a committed customer change.
    Promise.resolve().then(function() {
        return intent.payload.rewards.awardAction(archived ? 'customersArchived' : 'customersEdited');
    }).catch(function(error) { console.warn('Could not award customer badge.', error); });
    return { ok: true, intent: intent };
}

export default { emitCustomerMutation: emitCustomerMutation };
