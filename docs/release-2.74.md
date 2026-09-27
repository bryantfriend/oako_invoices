# Version 2.74 — Offline Quick Print and printed confirmation

Quick Print checks durable offline invoice snapshots before cloud queries and uses saved print settings when available. Missing invoices still follow the existing preparation flow. Both Full and 2-Up now present Mark as Printed and Skip in Orders after the PDF is ready. Only invoices fully included in the PDF can be marked; failed status writes remain retryable without repeating successful updates. Orders updates immediately after confirmation.

Validation: all 290 tests passed and the production build completed. Coverage includes local-only and mixed invoice lookups, cached settings, partial PDF failures, two-up pagination, confirmation gating and status retry behavior. No live customer records were changed during testing. Physical printing and device-specific performance require manual verification: print an offline invoice, return to Orders, try Skip, then repeat and confirm Mark as Printed.

The existing QuickPrintSelectedInvoicesIntent, PreparePrintableInvoiceIntent and MarkInvoicePrintedIntent retain all six ICF stages. Added application code uses named functions and explicit conditions. No database schema or Firebase rules changed. Cloud access is still needed when required data has never been saved locally.

Changed files:

- js/components/quickPrintConfirmation.js
- js/ICF/Stages/ContextProviders/Invoices/addQuickPrintSelectedInvoicesContext.js
- js/services/bulkInvoicePrintService.js
- js/services/invoiceService.js
- js/services/settingsService.js
- js/views/dashboardView.js
- tests/bulk-print-partial-failure.test.mjs
- tests/quick-print-confirmation.test.mjs
- scripts/build.cjs
- js/config.js
- js/service-worker/source-sw.js
- index.html
- deployment-version.json
- sw.js
- docs/release-2.74.md
