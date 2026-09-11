# Invoice archive recovery — version 2.58

The reported red banner came from an uncaught rejection in the Orders screen's Archive Draft handler. Its order lookup could also hide a connection or permission failure behind “Order not found,” and could miss a record visible in the app's cache because Firestore's separate memory cache was empty. The screenshot does not identify the specific order or the original read failure; the affected paths were reproduced with controlled fixtures.

## Fixes

- Draft archival now uses the existing `ArchiveSelectedOrdersIntent` flow, contains failures in a normal notification, suppresses repeated clicks, and updates the displayed row only after success. Already-archived records count as successful outcomes. A failed operation remains available to retry.
- Order lookup keeps confirmed server absence separate from read failures, preserves permission errors, and can use the signed-in account's Orders snapshot offline. A server-confirmed missing record is not silently recreated from stale cache data.
- Pending edits no longer make saved orders look like unsynced creates. Archive Draft preserves queued creates, their items, invoice references and background work instead of deleting them. If a create finishes syncing during lookup, archival falls through to the normal server/queue path instead of reporting a false local success.
- Document IDs take precedence over embedded IDs in server and cache snapshots. Existing data requires no migration.
- Sheets background jobs read only committed server records. A pending local edit cannot satisfy the job's committed-revision check, and an offline cache cannot stand in for the server.
- Print-status action failures are caught, and restoring an already-active order now reconciles the displayed row.

## Verification and rollout

- `npm run check`: **174 tests passed**, including 10 new behavioral regression tests. Build generated version 2.58 with 286 precached files.
- `npm run test:rules`: **11 integration tests passed**. Each supported staff role now exercises the actual order service lookup, archive, repeat archive and restore, in addition to invoice save, numbering, inventory, printing and reward transactions.
- Browser fixture: reproduced the reported rejection, retained the row with a normal error message and zero unhandled rejections, then successfully retried. The complete app also starts and loads its login screen with version 2.58.
- Production inspection was read-only. No live orders or invoices were edited for testing. Firebase rule sources are unchanged; the existing deployed permissions support the corrected operations.
- Publish the generated application and service worker together through GitHub Pages. Existing sessions can use **Update now**. No database migration, cache wipe, or deletion is required. Rollback is the previous application release; the data format remains compatible.

The archive action retains all six ICF stages: Validate, Normalize, AddContext, Authorize, Process and Emit. New and changed functions use the project style; unrelated legacy syntax is preserved.

## Changed files

```text
deployment-version.json
docs/invoice-archive-hotfix.md
index.html
js/components/orderArchiveAction.js
js/config.js
js/core/firestoreRead.js
js/service-worker/source-sw.js
js/services/orderService.js
js/services/workflowEffectsService.js
js/views/dashboardView.js
scripts/build.cjs
sw.js
tests/archive-safety.test.mjs
tests/firebase-rules.integration.mjs
tests/invoice-print-archive-icf.test.mjs
tests/offline-workbox.test.mjs
tests/order-archive-recovery.test.mjs
```
