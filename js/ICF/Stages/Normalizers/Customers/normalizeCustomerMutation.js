function normalizeCustomerMutation(intent) {
    intent.payload.customerId = intent.payload.customerId.trim();
    if (intent.type === 'UpdateCustomerIntent') {
        var data = {};
        ['name', 'companyName', 'phone', 'email', 'address', 'notes', 'category', 'pinCode'].forEach(function(field) {
            if (intent.payload.data[field] !== undefined) data[field] = String(intent.payload.data[field]).trim();
        });
        if (data.pinCode !== undefined && !/^1\d{5}$/.test(data.pinCode)) return { ok: false, errors: ['Customer PIN must start with 1 and contain 6 digits.'] };
        if (!Object.keys(data).length) return { ok: false, errors: ['No customer changes supplied.'] };
        intent.payload.data = data;
    }
    return { ok: true, intent: intent };
}

export default { normalizeCustomerMutation: normalizeCustomerMutation };
