export function validateDesktopAction(intent) {
    var payload = intent.payload;
    if (!payload || typeof payload !== 'object') return { ok: false, errors: ['Desktop action details are missing.'] };
    if (intent.type === 'PrintDesktopInvoicesIntent' || intent.type === 'FileDesktopInvoicesIntent') {
        if (typeof payload.windowName !== 'string' || !/^ko-invoice-print-\d+-\d+$/.test(payload.windowName)) return { ok: false, errors: ['Reopen the invoice print preview.'] };
        if (typeof payload.label !== 'string' || payload.label.length > 250) return { ok: false, errors: ['The invoice filename is invalid.'] };
    }
    return { ok: true, intent: intent };
}
