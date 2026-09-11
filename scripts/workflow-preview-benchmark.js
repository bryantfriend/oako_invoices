import { reserveInvoicePrintWindow, showNativeInvoicePrint } from '../js/services/nativeInvoicePrintService.js';
import bulkInvoicePrintService from '../js/services/bulkInvoicePrintService.js';

export function installWorkflowBenchmark() {
    window.runInvoiceFixtureBenchmark = async function(count, layout) {
        var fixture = window.__workflowFixture;
        var originalInvoices = fixture.invoices;
        if (!originalInvoices.length) throw new Error('Prepare a fixture invoice first.');
        var sample = originalInvoices[0];
        var invoices = Array.from({ length: count }, function(unused, index) {
            return Object.assign({}, sample, {
                id: 'benchmark-invoice-' + index, orderId: 'benchmark-order-' + index,
                invoiceNumber: 'INV-2026-' + String(index + 100).padStart(6, '0'),
                isPrinted: false, customerName: 'Benchmark café ' + (index + 1)
            });
        });
        fixture.invoices = invoices;
        var preview = reserveInvoicePrintWindow();
        var pdfPreview = reserveInvoicePrintWindow();
        try {
            var direct = await showNativeInvoicePrint(preview, invoices, fixture.settings, { layout: layout, autoPrint: false });
            var pdf = await bulkInvoicePrintService.generateCombinedPdf(invoices.map(function(invoice) { return invoice.orderId; }), layout, { settings: fixture.settings }, { previewWindow: pdfPreview });
            return { count: count, layout: layout, nativeMs: direct.durationMs, pdfMs: pdf.durationMs, pageCount: direct.pageCount, pdfBytes: pdf.blob.size };
        } finally {
            fixture.invoices = originalInvoices;
            preview.close(); pdfPreview.close();
        }
    };
}
