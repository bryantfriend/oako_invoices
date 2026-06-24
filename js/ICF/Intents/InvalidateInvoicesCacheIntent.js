import sessionDataIntentFactory from "./sessionDataIntentFactory.js";

function createInvalidateInvoicesCacheIntent(actor, payload, options) {
    return sessionDataIntentFactory.createSessionDataIntent(
        "InvalidateInvoicesCacheIntent",
        "invoices",
        "invalidate",
        actor,
        payload,
        options
    );
}

export default {
    createInvalidateInvoicesCacheIntent: createInvalidateInvoicesCacheIntent
};