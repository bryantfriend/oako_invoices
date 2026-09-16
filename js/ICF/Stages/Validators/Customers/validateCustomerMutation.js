function validateCustomerMutation(intent) {
    var p = intent.payload;
    if (!p || typeof p.customerId !== 'string' || !p.customerId.trim() || p.customerId.indexOf('/') !== -1) return { ok: false, errors: ['Refresh the list and select a valid customer.'] };
    if (intent.type === 'UpdateCustomerIntent' && (!p.data || typeof p.data !== 'object' || Array.isArray(p.data))) return { ok: false, errors: ['Customer changes are required.'] };
    return { ok: true, intent: intent };
}

export default { validateCustomerMutation: validateCustomerMutation };
