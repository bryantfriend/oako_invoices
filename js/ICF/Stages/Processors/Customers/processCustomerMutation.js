async function processCustomerMutation(intent) {
    var p = intent.payload;
    try {
        if (intent.type === 'ArchiveCustomerIntent') await p.customerApi.deleteCustomer(p.customerId);
        else await p.customerApi.updateCustomer(p.customerId, p.data);
    } catch (error) {
        var message = 'Could not save this customer. Check your connection and try again.';
        if (error.code === 'permission-denied') message = 'Customer changes were denied. Ask an administrator to check your staff access and deployed customer permissions.';
        if (error.code === 'not-found') message = 'This customer no longer exists. Refresh the customer list.';
        return { ok: false, errors: [message] };
    }
    intent.context.resultData = { customerId: p.customerId };
    return { ok: true, intent: intent };
}

export default { processCustomerMutation: processCustomerMutation };
