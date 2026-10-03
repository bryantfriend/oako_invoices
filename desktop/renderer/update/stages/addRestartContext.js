export async function addRestartContext(intent) {
    var api = intent.context.api;
    intent.context.updateState = await api.getUpdateState();
    intent.context.pending = await api.listPending();
    return { ok: true, intent: intent };
}
