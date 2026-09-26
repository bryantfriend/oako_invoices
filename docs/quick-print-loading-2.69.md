# Quick Print and oven loading — version 2.69

## What was fixed

Saving an order does not necessarily create an invoice. Quick Print previously counted only orders with an existing invoice, while normal Print prepared a missing invoice. Quick Print now includes every selected order and prepares missing invoices through the existing authorized PreparePrintableInvoiceIntent. Existing cached invoices remain usable even when their sync state is an error. Missing-data, QR and render failures are reported individually; other valid invoices continue. Failed lookups are not treated as permission to create a duplicate invoice. Normal Print and Quick Print share preparation already in flight for the same staff user/order, and failures release that guard for retry.

A second source of confusion was the Orders table: red text meant **not printed**, independently of the Sync column. Unprinted rows are now neutral, printed rows remain green, and genuine sync errors retain their separate status. Preparing or opening a PDF does not falsely mark it as physically printed.

Quick Print updates invoice readiness immediately and preserves selections on failure. Normal Print displays the underlying preparation error. Printing diagnostics still collect quietly in Conflicts; a failure to save a diagnostic cannot abort printing the remaining invoices.

## Loading design and coverage

Concept 1 is implemented as a lightweight oven illustration in CSS: a rising, browning loaf, warm glow, steam, and a large percentage. No extra image downloads are required. A shared foreground indicator appears after 100 ms, finishes at 100%, and supports overlapping operations, failure cleanup, navigation changes, mobile layouts and reduced motion. It does not disable browser navigation or cover printed pages.

Coverage includes application startup and routes; existing skeleton, operations, workflow and busy placeholders; asynchronous user controls across Orders, invoices, customers, inventory, collections, delivery, settings, profile, daily orders/batches, mobile invoices, customer approval, legacy products, offline data, sync/conflicts and support reports; editor save/print, customer/product pickers, search, authentication, modal confirmations, uploads, PDF generation, native print preparation and print confirmation. The new loader is also shown inside reserved print-preview tabs. Automatic background sync and quiet diagnostics continue without interrupting the user.

Print, batch and archive operations report completed work when counts are available. Requests without a measurable total show **Estimated progress**, approach a limit below 100%, and finish only when their operation completes. Percentages do not invent a server download total. A long request explicitly says it is taking longer than usual.

## Remaining errors and how to fix them

| Issue | Next step |
| --- | --- |
| Permission denied or malformed records | Download the affected account's Conflicts report. Correct the specific staff permission or record identified there, then use Retry after correction. Security rules have not been weakened. |
| Conflicting edits | Review the conflicting values and choose which should be retained. Automatic retries must not overwrite that decision. |
| Sheets delivery unconfirmed | Check the destination before resending. The external Apps Script endpoint needs a readable receipt and delivery-ID deduplication before confirmed automatic retries can be enabled. |
| Missing data or QR preparation failure | Quick Print lists the affected order/invoice and saves the diagnostic when storage is available. Correct or recover that record and retry the retained selection. |

The existing **Conflicts → Sync issues and support report → Download report** collects these details locally for the signed-in account. Nothing is sent automatically. Its privacy, retention and endpoint requirements are documented in [the 2.68 report](sync-recovery-2.68.md).

## Validation

- 265 automated tests passed, followed by the production build (316 precached files).
- New regression coverage: missing invoices are prepared, cached invoices with sync errors remain printable, one bad order or unavailable diagnostics cannot block good invoices, uncertain lookups do not create duplicates, concurrent preparation is shared, and failed preparation can retry.
- Loader tests cover the 100 ms threshold, estimates below 100%, monotonic measured progress, overlapping operations, failure cleanup, stale navigation, removed placeholders and timer cleanup.
- Chromium exercised the actual loader on desktop and at 390 px width, reduced-motion mode, reserved print tabs, immediate actions and error cleanup.
- The actual jsPDF/html2canvas renderer produced Full and 2-Up PDFs from a local fixture with a new order, two cached invoices (one with a sync error), and an invalid order. Both runs included three invoices and reported one failure; the new invoice was created once and reused.
- The complete application loaded to its sign-in screen. Production account mutations were not used for testing.

## Architecture and compatibility

QuickPrintSelectedInvoicesIntent and PreparePrintableInvoiceIntent retain all six stages: Validate, Normalize, AddContext, Authorize, Process and Emit. Invoice creation stays in the existing preparation pipeline. The oven is presentation infrastructure. New helpers use named functions and explicit control flow; existing legacy callback syntax is preserved. Database schema, Firebase rules and existing sync recovery behavior are unchanged.

## Changed files

- css/oven-loading.css
- deployment-version.json
- docs/quick-print-loading-2.69.md
- index.html
- js/components/createOrderWorkflow.js
- js/components/globalCommandPalette.js
- js/components/invoicePreparationProgress.js
- js/components/loadingQuotes.js
- js/components/loadingSkeleton.js
- js/components/modal.js
- js/components/ovenLoading.js
- js/components/sidebar.js
- js/components/syncSupportPanel.js
- js/config.js
- js/controllers/invoiceController.js
- js/main.js
- js/router.js
- js/service-worker/source-sw.js
- js/services/bulkInvoicePrintService.js
- js/services/invoiceService.js
- js/services/nativeInvoicePrintService.js
- js/views/collectionsView.js
- js/views/conflictReviewView.js
- js/views/createOrderView.js
- js/views/customerDetailView.js
- js/views/customerView.js
- js/views/dailyInvoiceBatchView.js
- js/views/dailyOrdersView.js
- js/views/dashboardView.js
- js/views/deliveryWorkspaceView.js
- js/views/inventoryView.js
- js/views/invoiceView.js
- js/views/layoutView.js
- js/views/legacyProductsView.js
- js/views/loginView.js
- js/views/mobileInvoiceView.js
- js/views/offlineCacheView.js
- js/views/orderDetailView.js
- js/views/orderReviewPage.js
- js/views/profileView.js
- js/views/settingsView.js
- scripts/build.cjs
- sw.js
- tests/bulk-print-partial-failure.test.mjs
- tests/bulk-quick-print.test.mjs
- tests/customer-actions.test.mjs
- tests/helpers/load-isolated-module.mjs
- tests/invoice-draft-recovery.test.mjs
- tests/invoice-preparation-concurrency.test.mjs
- tests/invoice-productivity.test.mjs
- tests/orders-inventory-strip.test.mjs
- tests/oven-loading.test.mjs
