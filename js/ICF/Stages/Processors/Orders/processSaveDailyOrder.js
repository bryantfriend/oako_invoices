import resultHelpers from "../../../engine/resultHelpers.js";

async function processSaveDailyOrder(intent) {
    var payload = intent.payload;
    var orderRecord = {
        customerName: payload.customerName,
        orderDate: payload.orderDate,
        notes: payload.notes,
        items: payload.items,
        selectedPriceMode: payload.selectedPriceMode,
        subtotal: payload.subtotal,
        totalAmount: payload.totalAmount,
        status: payload.status || 'draft'
    };
    var orderId = payload.orderId;
    var created = !orderId;

    if (created) {
        orderId = await payload.orderApi.createOrder(orderRecord, payload.userId);
    } else {
        await payload.orderApi.updateOrder(orderId, orderRecord);
    }

    intent.context.resultData = {
        orderId: orderId,
        created: created,
        order: Object.assign({}, orderRecord, { id: orderId })
    };
    return resultHelpers.success(intent);
}

export default {
    processSaveDailyOrder: processSaveDailyOrder
};
