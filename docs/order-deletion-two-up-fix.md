# Order deletion and two-copy portrait printing

## Behavior

The Orders trash action remains a reversible archive. If a successful server read confirms that an order is already gone, the action clears the stale cached row instead of returning an endless “not found, refresh” error. It checks the legacy archive first, preserves queued creates, and still reports network and permission failures. An order removed between the lookup and the archive transaction is handled the same way. Queued archive retries also finish when the server confirms the order is gone; missing updates and restores still fail.

Orders refresh now distinguishes a complete server result from a partial/cache fallback. Complete results remove obsolete cached rows. Offline fallback retains known records, and mutations made during a refresh are protected against stale responses. Explicit removal markers prevent a running request from bringing a removed row back. The collection read includes legacy records without `createdAt`, which an ordered Firestore query would omit.

Every **2-up Portrait** sheet now contains two copies of the same invoice page, as requested. A multi-page invoice prints matching copies of page 1 on sheet 1, page 2 on sheet 2, and so on. Different invoices are not paired together. This applies to:

- Individual invoice preview, including reprints and previews opened on later pages or at a different zoom.
- New/edit order workflow printing, including reopened saved drafts.
- Daily invoice batch printing through the native print service.
- Orders Quick Print, with one, odd, even, or multi-page selections.
- Daily Orders “save and print”, including long orders that need pagination.

The individual preview retains its duplicate layout until `afterprint`, rather than removing it after 1.5 seconds. Layout is anchored within each half-sheet instead of relying on negative margins or offscreen page positions. Native printing waits for assets and layout. Quick Print draws the prepared invoice QR directly into its raster capture because the renderer could omit that image despite it being loaded.

## Verification

- `npm run check`: **212 tests passed**, production service-worker build passed.
- JavaScript syntax checks and `git diff --check` passed.
- Chrome rendered synthetic local fixtures and exported printed PDFs. Twelve scenarios covered A4, Letter, Legal, A3, A5, individual and native printing, a 41-item invoice, odd batches, long Daily Orders, and the actual html2canvas/jsPDF Quick Print pipeline. Page counts and two copies per sheet were checked. Representative first and final pages were rasterized and visually inspected, including the corrected invoice QR.
- Regression tests cover missing orders, legacy archives, permission/network errors, lookup/transaction races, refresh/mutation races, queued archive retries, full versus cached reads, delayed print completion, duplicate clicks, and every invoice page in 2-up jobs.

Generate local fixtures with `node scripts/create-two-up-print-fixtures.mjs --serve`. They are written under the ignored `output/playwright/two-up/` directory and served on localhost port 8766. The fixture bundle substitutes synthetic records and QR generation; it does not read or write production data.

Manual release acceptance: archive a draft and refresh Orders; confirm it stays out of Active. Reopen it through Archived to check reversibility. Print one invoice and an odd batch in 2-up Portrait; each sheet should contain two copies of the same page. Check a multi-page invoice from page 2 at non-default zoom and cancel/retry the print dialog.

## Changed files

| Files | Change |
| --- | --- |
| `js/core/firestoreRead.js` | Report whether collection results came from the server. |
| `js/services/orderService.js` | Complete collection reads, missing-order cleanup, legacy archive check, transaction race handling. |
| `js/services/sessionDataStore.js` | Authoritative refresh reconciliation and mutation/removal protection. |
| `js/services/syncService.js` | Idempotent replay of archives for server-confirmed missing orders. |
| `js/views/dashboardView.js` | Remove stale rows and retain returned lifecycle state after archival. |
| `js/services/nativeInvoicePrintService.js` | Duplicate each page and wait for layout. |
| `js/services/bulkInvoicePrintService.js` | Two copies per invoice page and explicit QR raster capture. |
| `js/views/invoiceView.js` | Stable half-sheet placement, print lifecycle, font size, and repeated-click protection. |
| `js/views/dailyOrdersView.js` | Paginated copies and measured half-sheet fit. |
| `tests/order-archive-recovery.test.mjs`, `tests/orders-refresh-reconciliation.test.mjs` | Delete and refresh regressions. |
| `tests/bulk-quick-print.test.mjs`, `tests/invoice-productivity.test.mjs`, `tests/two-up-print-regressions.test.mjs` | Updated two-copy expectations and behavioral print/sync regressions. |
| `scripts/create-two-up-print-fixtures.mjs` | Reproducible synthetic browser fixtures. |
| `sw.js` | Regenerated production precache manifest. |

## Compatibility and limits

No database schema/rules migration or destructive deletion was added. Existing archive and print-status intents retain their Validate, Normalize, AddContext, Authorize, Process, and Emit stages. No new mutation intent is introduced. Added application code uses traditional functions and explicit conditions; existing unrelated code is preserved.

Packaged in release 2.61 together with the historical-match and daily-sales fixes. No production records or physical printers were used for testing. Browser PDF output was verified in Chrome; physical printer drivers and other browsers still need release acceptance.
