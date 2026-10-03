export function validateRestart(intent) {
    if (!intent.payload || intent.payload.confirmed !== true) {
        return { ok: false, errors: ['Save your edits and confirm the restart first.'] };
    }
    return { ok: true, intent: intent };
}
