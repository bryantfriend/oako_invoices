import resultHelpers from "../../../engine/resultHelpers.js";

function emitSaveDailyOrderResult(intent) {
    var resultData = intent.context.resultData || {};
    if (!Array.isArray(intent.context.events)) {
        intent.context.events = [];
    }
    intent.context.events.push({
        type: resultData.created ? 'DailyOrderCreated' : 'DailyOrderUpdated',
        orderId: resultData.orderId,
        orderDate: resultData.order ? resultData.order.orderDate : ''
    });
    return resultHelpers.success(intent);
}

export default {
    emitSaveDailyOrderResult: emitSaveDailyOrderResult
};
