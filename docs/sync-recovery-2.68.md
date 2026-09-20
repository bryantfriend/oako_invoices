# Sync recovery and quiet support reports — version 2.68

## What changed

- The retry classifier now recognizes namespaced Firebase authentication errors, expired user tokens, aborted/timeout requests, and common browser fetch failures. Unknown errors, permissions, invalid data, and conflicts are still held for review.
- Authentication recovery refreshes the original staff user's token before requeueing their blocked changes. Checks are limited to once per minute while blocked work exists. Changing accounts cannot requeue another user's records.
- Conflicts now includes **Sync issues and support report**, beneath the existing conflict cards. Issues collect quietly, without popups or automatic transmission. Staff can expand an issue, copy/download the report, refresh details, or select **Retry after correction** for their own authentication-blocked/terminal queue entry. The retry keeps the original operation ID and payload, rechecks authentication and ownership, and never retries an unresolved conflict.
- Queue processing uses a browser-wide Web Lock where available and renews its IndexedDB lease every ten seconds. Setup failures release the lease; session/ownership changes stop further processing. Stale work is recovered under a lease even when there are no pending records. Ordinary queue initialization no longer resets in-flight records outside that lease.
- A completed offline invoice queues a separate Sheets export after its database update. A Sheets delivery error no longer causes that invoice update to be replayed. The existing background effect Intent supports the new invoice export kind.
- Sheets requests include a stable delivery ID for queued effects. A saved marker is written before sending; an interrupted/uncertain delivery stays held across reloads. An opaque response is recorded as **unconfirmed**, not as verified delivery. Missing webhook configuration becomes a review item. Readable receipts must confirm the entity and, when present, the delivery ID. Original errors are preserved through the workflow runner.
- Quick Print failures are also included in the support history, with the affected record ID and preparation error.

## What the report contains

Version and service-worker version, capture/export timestamps, connectivity flags, source/action, affected record and operation IDs, queue status, error code and redacted message, attempt counts, next attempt time, top-level payload field names (not their values), and a bounded history of status changes.

The report is kept in this browser's existing offline database, scoped to the signed-in account. It retains up to 200 issues seen during the last 30 days, with up to 12 status-history entries per issue. Invoice/customer payloads and credentials are not copied. URLs, email addresses, bearer tokens, and common secret fields in error text are redacted. Record IDs and error text are still intended for staff/support use. No automatic upload or message is sent. Browser storage being cleared removes locally collected reports and can also remove unsynced work.

## What still needs a decision or external work

1. **Sheets delivery verification.** The current cross-origin Apps Script endpoint is configured by the user and its source/deployment is outside this repository. Legacy no-cors delivery cannot prove row acceptance. Check the destination for unconfirmed entries before resending. To automate confirmed retries, provide an authenticated endpoint with a readable response and server-side deduplication using `deliveryId`. Its success response must contain `{ "success": true, "entityId": "...", "deliveryId": "..." }` for queued requests. A separate future integration change must select a verified readable transport; the legacy transport remains compatible here. Do not enable blind append retries based only on HTTP success.
2. **Permission and malformed-record errors.** The report identifies the rejected operation and error. Correct the narrow account/rule/data problem, then use Retry after correction. This release does not weaken database rules or rewrite failed invoice payloads.
3. **Conflicting versions and deleted records.** Compare the existing Server/Offline cards and explicitly choose the right version. Automatic recovery does not decide which user edits to overwrite.
4. **Unsupported browsers or suspended tabs.** Browsers with Web Locks get protection across long pauses. The lease is also renewed for other browsers, but a suspended browser without Web Locks cannot guarantee an in-flight server write is canceled when its lease expires. Existing server-side idempotency remains important. Faster retries run while the application is open.

## Validation and how to use

- 255 tests passed and the production build succeeded before final release checks. Coverage includes error classification, same-user recovery, all six RetrySyncItemsIntent stages, ownership rechecks inside the storage transaction, renewal/loss of leases, stale recovery, setup cleanup, persisted account-scoped diagnostics, redaction, escaped UI content, uncertain Sheets delivery, and restart-safe export markers.
- Local browser fixture uses the actual Conflicts view and support panel with test-only data. Verified expanded guidance, report download, successful Retry control, and the styled desktop layout. No production invoice was changed for testing. The fixture's initial favicon 404 was removed; application code produced no browser errors in the final preview.
- After updating, go to **Conflicts → Sync issues and support report**. Use **Download report** or **Copy report** when ready to send diagnostic details. Leave the app open to allow due retries. After correcting an issue, use Retry after correction and refresh details to inspect the resulting state.

## Architecture and compatibility

RetrySyncItemsIntent includes Validate, Normalize, AddContext, Authorize, Process, and Emit, with one stage per file and registration through the existing base registries. The existing RunWorkflowEffectIntent retains its six stages. Diagnostic reads, rendering, and local support history are infrastructure, not invoice mutations. New application code uses named functions and the project's explicit conditional style. Existing database schema and Firebase rules are unchanged.

## Changed files

Application: js/main.js; js/views/conflictReviewView.js; js/components/syncSupportPanel.js; js/services/automaticSyncService.js; js/services/syncRecoveryService.js; js/services/syncSupportService.js; js/services/syncSupportCollector.js; js/services/syncRetryPolicy.js; js/services/syncService.js; js/services/offlineQueueService.js; js/services/offlineDexieDb.js; js/services/googleSheetsService.js; js/services/invoiceService.js; js/services/workflowEffectsService.js; js/services/workflowLocalStore.js; js/services/bulkInvoicePrintService.js.

ICF: js/ICF/Intents/RetrySyncItemsIntent.js; the six Sync stage files and corresponding base registries; js/ICF/Stages/Validators/Workflow/validateInvoiceWorkflowPayload.js.

Tests: tests/sync-recovery.test.mjs; tests/helpers/load-isolated-module.mjs; tests/automatic-sync.test.mjs; tests/bulk-print-partial-failure.test.mjs; tests/invoice-productivity.test.mjs.

Release: scripts/build.cjs; js/config.js; js/service-worker/source-sw.js; index.html; deployment-version.json; sw.js; this document.

