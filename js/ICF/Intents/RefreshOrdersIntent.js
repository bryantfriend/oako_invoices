import sessionDataIntentFactory from "./sessionDataIntentFactory.js";

function createRefreshOrdersIntent(actor, payload, options) {
    return sessionDataIntentFactory.createSessionDataIntent(
        "RefreshOrdersIntent",
        "orders",
        "refresh",
        actor,
        payload,
        options
    );
}

export default {
    createRefreshOrdersIntent: createRefreshOrdersIntent
};