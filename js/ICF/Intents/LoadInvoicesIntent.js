import sessionDataIntentFactory from "./sessionDataIntentFactory.js";

function createLoadInvoicesIntent(actor, payload, options) {
    return sessionDataIntentFactory.createSessionDataIntent(
        "LoadInvoicesIntent",
        "invoices",
        "load",
        actor,
        payload,
        options
    );
}

export default {
    createLoadInvoicesIntent: createLoadInvoicesIntent
};