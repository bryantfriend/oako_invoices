export function authorizeRestart(intent) {
    if (intent.context.updateState.status !== 'ready') {
        return { ok: false, errors: ['The update has not finished downloading.'] };
    }
    if (intent.context.pending.length && !intent.context.api.getUserId()) {
        return { ok: false, errors: ['Sign in and sync pending work before restarting.'] };
    }
    return { ok: true, intent: intent };
}
