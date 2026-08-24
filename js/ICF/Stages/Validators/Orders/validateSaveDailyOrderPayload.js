import resultHelpers from "../../../engine/resultHelpers.js";

function validateSaveDailyOrderPayload(intent) {
    var payload = intent && intent.payload ? intent.payload : {};
    var errors = [];

    if (!String(payload.customerName || '').trim()) {
        errors.push('Customer name is required.');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(payload.orderDate || ''))) {
        errors.push('A valid order date is required.');
    }
    var hasPositiveQuantity = Array.isArray(payload.items) && payload.items.some(function(item) {
        return Number(item && item.quantity) > 0;
    });
    if (!hasPositiveQuantity) {
        errors.push('At least one product with a quantity above zero is required.');
    }
    if (!payload.orderApi || typeof payload.orderApi.createOrder !== 'function' || typeof payload.orderApi.updateOrder !== 'function') {
        errors.push('Daily order save API is required.');
    }

    if (errors.length) {
        return resultHelpers.validationFailure(errors);
    }
    return resultHelpers.success(intent);
}

export default {
    validateSaveDailyOrderPayload: validateSaveDailyOrderPayload
};
