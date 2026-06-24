import sessionDataIntentFactory from "./sessionDataIntentFactory.js";

function createInvalidateOrdersCacheIntent(actor, payload, options) {
    return sessionDataIntentFactory.createSessionDataIntent(
        "InvalidateOrdersCacheIntent",
        "orders",
        "invalidate",
        actor,
        payload,
        options
    );
}

export default {
    createInvalidateOrdersCacheIntent: createInvalidateOrdersCacheIntent
};