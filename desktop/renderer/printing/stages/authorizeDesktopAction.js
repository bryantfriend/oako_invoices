export function authorizeDesktopAction(intent) {
    var user = intent.context.verifiedUser;
    if (!user || !user.isAdmin || user.id !== intent.actor.id) return { ok: false, errors: ['Sign in with your staff account to change desktop settings or print invoices.'] };
    return { ok: true, intent: intent };
}
