export function addDesktopActionContext(intent) {
    var api = intent.context.api;
    intent.context.verifiedUser = api.getVerifiedUser();
    return { ok: true, intent: intent };
}
