export function validateDesktopAction(intent) {
    var payload = intent.payload;
    if (!payload || typeof payload !== 'object') return { ok: false, errors: ['Desktop action details are missing.'] };
    if (intent.type === 'PrintDesktopInvoicesIntent' || intent.type === 'FileDesktopInvoicesIntent' || intent.type === 'PrintDesktopDeliveryRunIntent') {
        if (typeof payload.windowName !== 'string' || !/^ko-invoice-print-\d+-\d+$/.test(payload.windowName)) return { ok: false, errors: ['Reopen the invoice print preview.'] };
        if (typeof payload.label !== 'string' || payload.label.length > 250) return { ok: false, errors: ['The invoice filename is invalid.'] };
    }
    if (intent.type === 'PrintDesktopDeliveryRunIntent') {
        if (!Array.isArray(payload.documents) || payload.documents.length !== 3) return { ok: false, errors: ['Prepare invoices, packing lists, and labels before printing.'] };
        var types = ['invoice', 'packing', 'labels'];
        for (var index = 0; index < types.length; index += 1) {
            var document = payload.documents[index];
            if (!document || document.type !== types[index] || !/^ko-invoice-print-\d+-\d+$/.test(document.windowName || '')) return { ok: false, errors: ['The delivery documents are invalid.'] };
        }
    }
    return { ok: true, intent: intent };
}
