export function normalizeRestart(intent) {
    intent.payload = { confirmed: intent.payload.confirmed === true };
    return { ok: true, intent: intent };
}
