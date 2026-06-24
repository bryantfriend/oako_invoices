import sessionDataIntentFactory from "./sessionDataIntentFactory.js";

function createRefreshInvoicesIntent(actor, payload, options) {
    return sessionDataIntentFactory.createSessionDataIntent(
        "RefreshInvoicesIntent",
        "invoices",
        "refresh",
        actor,
        payload,
        options
    );
}

export default {
    createRefreshInvoicesIntent: createRefreshInvoicesIntent
};