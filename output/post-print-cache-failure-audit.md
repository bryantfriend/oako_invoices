# Post-Print Cache Failure Audit

Date: 2026-08-13

## Finding

The reported “failed to get the cached document” error can occur after the physical print succeeds but before the application records the job as printed. The failure is in the follow-up `MarkInvoicePrintedIntent`, not in PDF generation or browser printing.

## Current flow

1. The invoice is rendered and printed.
2. The UI asks whether to mark it as printed.
3. `invoiceController.markPrinted()` calls `invoiceService.markInvoicePrinted()` with only the invoice ID and order ID.
4. The Intent's Add Context stage re-fetches the invoice and order.
5. Both service lookups choose between a server document read and `getDocFromCache()` by calling `offlineStatusService.isOnline()`.
6. The Process stage then writes `isPrinted: true` and `printedAt` to the order and invoice. Draft orders become confirmed; draft/submitted invoices become approved.

## Root cause

`offlineStatusService.isOnline()` means the connection monitor currently considers the cloud reachable. That is stricter than “the browser can still attempt a bounded cloud read.” A temporary degraded/limited state can therefore force the lookup down the cache-only branch.

The order lookup calls `getDocFromCache()` and rethrows its exception when the exact document is not present in Firestore's document cache. The Add Context stage does not catch that exception or consult the dashboard/session record that is already loaded. The Intent stops before either printed-status update.

The invoice lookup catches its own cache exception and returns `null`, which later becomes a controlled “Invoice not found” authorization failure. The order lookup exposes the raw Firebase cache error, matching the reported message.

The project already provides `offlineStatusService.canAttemptCloudRead()` specifically for degraded connectivity, and other services use it. The order and invoice single-document reads still use `isOnline()`.

## Contributing design issues

- The print screen already has the invoice, and the session data store generally has the order, but the completion action discards those trusted snapshots and requires fresh document-cache reads.
- Firestore's internal document cache and the application's session/Dexie/offline-queue caches are different. A record visible in the UI is not guaranteed to exist in the exact cache queried by `getDocFromCache()`.
- Context loading is sequential: invoice first, then order. Either lookup can prevent an idempotent update.
- Order and invoice are updated in two separate operations. A later failure can leave one marked printed and the other not, although retrying is mostly safe.
- The error shown to the user is a low-level Firebase message and does not explain whether printing itself succeeded.

## Recommended correction

Use a layered trusted-context lookup for `MarkInvoicePrintedIntent`:

1. Accept the invoice snapshot already displayed by the invoice detail screen.
2. Resolve the order from the application's session data store or offline queue snapshot.
3. If context is still missing and `canAttemptCloudRead()` is true, attempt a bounded server read even in degraded mode.
4. Fall back to Firestore's document cache only in true offline mode.
5. If no trusted record can be found, return a controlled retry message and do not expose the raw Firebase cache error.

For general `getOrderById()` and `getInvoice()` behavior, replace the binary `isOnline()` read decision with the established `canAttemptCloudRead()` policy, while retaining local snapshots as the first true-offline fallback.

The printed-status mutation should remain idempotent. If practical, update the linked order and invoice in one Firestore batch when online. If offline queuing keeps them separate, persist a shared operation ID and report partial completion so synchronization can repair it deterministically.

## Suggested user-facing failure

`The invoice was printed, but its status could not be saved yet. Check your connection and choose “Mark as Printed” again; printing will not be duplicated.`

## Regression tests needed

- Degraded connection with no Firestore document-cache entry but a valid session order/invoice.
- True offline mode with an offline-queue snapshot.
- Cache miss with no usable local snapshot returns a controlled failure.
- Order update succeeds and invoice update fails; retry completes without a duplicate reward.
- Already-printed order and invoice remain unchanged and do not award twice.
- Draft-to-confirmed and draft/submitted-to-approved transitions remain intact.

The existing focused print tests cover status transitions, duplicate reward prevention, ICF stage completeness, and session-cache patching after success. They do not exercise the Add Context cache-miss path.

## ICF assessment

`MarkInvoicePrintedIntent` is already the correct action boundary and has all six stages. The fix belongs primarily in Add Context and the service read policy; it does not require a new Intent. Full ICF around low-level cache reads would be over-engineering.

Implementation status: trusted session context, degraded cloud-read fallback, controlled cache-miss messaging, and queued offline order/invoice print-status updates were implemented for release 2.44. No production data was migrated or rewritten.
