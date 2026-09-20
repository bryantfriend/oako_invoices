# Sync reliability review — release 2.67

Date: September 20, 2026

## Scope and evidence

This is a source-code review, not an inspection of a customer's live failed queue. The code paths and recovery gaps below are confirmed in this checkout; the exact cause of the originally reported invoice failure remains unknown until its diagnostic error is inspected. No production invoice records were changed for this review.

## What 2.67 fixes

Previously, the offline queue stored a next-attempt time but the app primarily ran it at startup, when cloud connectivity returned, or on Sync Now. A temporary failure could therefore sit pending while the connection remained online.

The new automaticSyncService wakes the existing queue processor shortly after a queue change, checks due work every five seconds, and checks on focus or returning to a visible tab. Existing startup and reconnect triggers remain. The existing processor still checks authentication, retry eligibility and its shared sync lease. The scheduler prevents overlapping automatic runs within the same tab.

Five seconds is the queue-check interval, not a promise that every invoice is resent every five seconds. Existing exponential retry delays start around one second and reach several minutes. Browser suspension or timer throttling can delay checks. The page must remain open; this is not a server-side background worker. Queued changes remain local until acknowledged.

Validation: 244 tests passed and the production build succeeded. Tests cover new saves, due retries, offline/signed-out behavior, repeated initialization, slow runs, and recovery after a thrown error. No authenticated production save or physical print test was performed.

## Other errors and how to fix them

| Error or condition | Current behavior / cause | Recovery now | Recommended implementation |
| --- | --- | --- | --- |
| Temporary network errors, timeouts, server unavailable, rate limiting | Recognized transient errors enter retry_wait. | Leave the app open with a working connection; 2.67 runs due retries. Sync Now can bypass the wait for eligible records. | Keep backoff. Show next attempt and last error per invoice. |
| Login expired or authentication unavailable | An explicit unauthenticated error becomes blocked_authentication. Normal queue selection excludes that status. I found no automatic transition back to pending after sign-in. | Restore the original account session, then inspect the blocked entry. Signing in or clicking Sync Now alone does not currently requeue it. | Add an authenticated recovery Intent that only requeues the same user's blocked entries, after rechecking identity. Handle namespaced authentication codes consistently. |
| Permission denied | Classified as failed_terminal. The account, store access, requested operation, or deployed rule must be investigated. | Verify the intended user and permissions against the exact failed operation. Repeated clicking cannot repair access. | Fix the narrow permission or payload mismatch, then provide an authorized Retry action that revalidates and requeues the stored operation. Do not broadly relax database rules. |
| Conflicting edits or an invoice missing from the server | The invoice update path creates a conflict when another device changed the record or the target is missing. Automatic replay deliberately stops. | Use Review conflicts, compare Server and Offline, then choose Use Server, Use Offline, or Manual after deciding which data is correct. Use Server accepts server data; Use Offline explicitly overwrites. | Improve the comparison UI and distinguish deletion/missing-record cases from concurrent edits. Do not auto-overwrite. Preserve local data until an explicit resolution. |
| Invalid data, missing target, failed precondition | These error codes become failed_terminal. A precondition error alone does not identify the cause; the full message matters. | Inspect the exact code/message and affected entity; correct the data, missing dependency, or configuration first. | Validate before enqueueing, use structured error codes, and add an audited repair-and-retry Intent. Retry the corrected original operation with its stable identity rather than making duplicate invoices. |
| Unrecognized error | The fallback classifier is failed_terminal. Recoverable errors without a recognized code/message can become permanently stuck. | Inspect Synchronization Details before attempting repair. | Preserve original error codes and causes throughout wrappers. Add explicit tests for fetch failures, AbortError/timeouts, and namespaced Firebase auth errors. Do not make every unknown error retry forever. |

### 1. Highest priority: recovery for blocked and terminal entries

Source: js/services/offlineQueueService.js:355, js/services/offlineQueueService.js:405, js/services/syncRetryPolicy.js:51, js/services/syncService.js:466.

Both automatic processing and manual Sync Now select only pending and retry_wait records. Manual mode bypasses nextAttemptAt but does not include blocked_authentication, failed_terminal, or conflict. Faster retry scheduling therefore does not revive previously blocked records.

Implement same-user authentication recovery and an explicit repair/retry workflow with all six ICF stages (Validate, Normalize, AddContext, Authorize, Process, Emit). Keep actor ownership, conflict checks, stored operation IDs, and duplicate-write protection. Tests should cover successful reauthentication, wrong-account attempts, unresolved permissions, a repaired payload, and repeated retry clicks.

### 2. Google Sheets delivery is not reliably acknowledged

Source: js/services/googleSheetsService.js:77, :109, :122; js/services/syncService.js:241.

The webhook uses no-cors and treats an opaque response as success. That response cannot establish whether the remote script saved the rows. When sync is enabled but no webhook is configured, it returns skipped. Completed-invoice synchronization also wraps a returned error in a new generic Error, losing the original error code. An aborted request's message may consequently be treated as terminal rather than transient.

Recommended fix: use an authenticated endpoint that returns a verifiable acknowledgement; report missing configuration as an actionable setup problem; preserve structured error codes; track Firestore save and Sheets export separately. Invoice exports use append mode, so before increasing their retries, require an idempotent server-side key per invoice/line/operation. The remote script was not inspected, so whether it already deduplicates is unknown. Test a timeout after the server accepts a request and confirm retry does not append duplicates.

### 3. Long sync runs need stronger coordination

Source: js/services/offlineDexieDb.js:7, :127, :158; js/services/syncService.js:449–537; js/services/automaticSyncService.js.

The cross-tab lease expires after 45 seconds and is not renewed by the processing loop. A slow batch can exceed that time. With multiple tabs checking for work, another tab could acquire the expired lease while the first is still active. The local scheduler's running flag protects only its own tab. This is a code-level risk, not a reproduced production duplicate.

Also, stale syncing records are recovered inside processQueue, but the automatic scheduler enters that processor only when pending/retry_wait work is already available. A queue consisting solely of abandoned syncing records may need startup, reconnect, or Sync Now to trigger recovery.

Recommended fix: renew the lease during processing, stop if ownership is lost, place all work after lease acquisition inside a finally-protected scope, and run stale-record recovery under the valid lease even if no pending work exists. Add two-tab tests with a batch exceeding 45 seconds and a crashed worker. Retain stable operation identities and server-side duplicate protection.

## How to identify the user's actual failure

1. On the affected browser/device, open Synchronization Details using the sync details control.
2. Record app version, connection mode, queue status, entity ID, action type, lastErrorCode, lastErrorMessage, attempt count, and nextAttemptAt. These fields already exist in the diagnostics.
3. Match the entry to the table above. A print-time QR/token error can also be separate from offline queue synchronization; the message shown by Quick Print helps distinguish it.
4. Preserve the affected local queue while investigating. Clearing browser storage can remove changes that have never reached the server.
5. Apply the targeted correction, then verify both the queue acknowledgement and the resulting server invoice. For a Sheets problem, verify the destination row separately.

## Suggested order of follow-up work

1. Same-user login recovery and an actionable failed-item Retry interface.
2. Renewable cross-tab lease and recovery of abandoned syncing entries.
3. Structured error classification tests and preservation of underlying error codes.
4. Confirmed, idempotent Google Sheets delivery with separate export status.
5. Clear per-invoice messages: waiting to retry, sign-in required, conflict needs review, or data repair required.

These are recommendations, not changes included in 2.67. Version 2.67 adds the scheduler and its tests; existing Intent stages, permissions, and data schemas remain unchanged. New code follows the project's named-function style.

Release files: js/services/automaticSyncService.js, js/main.js, tests/automatic-sync.test.mjs, scripts/build.cjs, js/config.js, js/service-worker/source-sw.js, index.html, deployment-version.json, sw.js, and this report.
