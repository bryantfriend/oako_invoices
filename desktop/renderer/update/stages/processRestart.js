export async function processRestart(intent) {
    var api = intent.context.api;
    if (intent.context.pending.length) {
        await api.sync();
    }
    // Include failed, conflicted, and other accounts' pending items: no silent loss.
    var remaining = await api.listPending();
    if (remaining.length) {
        return { ok: false, errors: ['Pending changes still need to sync or be reviewed. Finish them before restarting.'] };
    }
    if (!await api.restart()) {
        return { ok: false, errors: ['The desktop update could not restart. Try again.'] };
    }
    intent.context.result = { restarting: true };
    return { ok: true, intent: intent };
}
