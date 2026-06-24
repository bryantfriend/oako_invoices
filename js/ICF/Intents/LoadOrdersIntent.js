import sessionDataIntentFactory from "./sessionDataIntentFactory.js";

function createLoadOrdersIntent(actor, payload, options) {
    return sessionDataIntentFactory.createSessionDataIntent(
        "LoadOrdersIntent",
        "orders",
        "load",
        actor,
        payload,
        options
    );
}

export default {
    createLoadOrdersIntent: createLoadOrdersIntent
};