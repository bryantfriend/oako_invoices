export function normalizeDesktopAction(intent) {
    intent.payload = Object.assign({}, intent.payload);
    if (intent.payload.label) intent.payload.label = intent.payload.label.trim();
    return { ok: true, intent: intent };
}
