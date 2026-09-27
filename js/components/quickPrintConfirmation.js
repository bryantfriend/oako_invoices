import { Modal } from './modal.js';
import { t } from '../core/i18n.js';
import { invoiceController } from '../controllers/invoiceController.js';
import { notificationService } from '../core/notificationService.js';

function escapeHtml(value) {
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

export function showQuickPrintConfirmation(printResult, onMarked) {
    var remaining = (printResult.includedInvoices || []).slice();
    if (!remaining.length) {
        return;
    }
    var failures = printResult.failedInvoices || [];
    var content = '<p>' + escapeHtml(t('modal_print_body')) + '</p>';
    content += '<p>' + remaining.length + ' invoices are included in the PDF. Confirm only after printing them from the preview tab.</p>';
    if (failures.length) {
        content += '<p>These invoices were skipped and will not be marked as printed:</p><ul>';
        content += failures.map(function renderFailure(message) {
            return '<li>' + escapeHtml(message) + '</li>';
        }).join('') + '</ul><p>Your selection has been kept so you can retry.</p>';
    }
    var modal = new Modal({
        title: t('modal_print_title'),
        content: content,
        confirmText: t('btn_mark_printed'),
        cancelText: t('btn_skip'),
        lockWhileSubmitting: true,
        onConfirm: async function markIncludedInvoicesPrinted() {
            var failed = [];
            for (var invoice of remaining) {
                var result = await invoiceController.markPrinted(invoice.id, invoice.orderId, { invoice: invoice });
                if (!result) {
                    failed.push(invoice);
                } else if (typeof onMarked === 'function') {
                    onMarked(invoice, result);
                }
            }
            // Retry only failed status writes; successful invoices need no second update.
            remaining = failed;
            if (remaining.length) {
                notificationService.error(remaining.length + ' invoice statuses could not be saved. Try again or Skip.');
                return false;
            }
            notificationService.success(t('msg_invoice_printed'));
            return true;
        }
    });
    modal.open();
}
