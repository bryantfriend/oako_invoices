# Invoice productivity rollout

This change is additive. It preserves existing orders, invoice numbering, price snapshots, archived records, print templates, and the PDF exporter. No backfill, deletion, or Dexie schema change is required.

## Data and rollout

- Publish `firebase/firestore.rules` together with the application release. The new `workflow_rewards/{action}-{entityId}` receipt is immutable and records `actorId`, `action`, `entityId`, and `createdAt`. The reward and user counters are written in one transaction. Existing users keep their XP and badges. Historical activity is not backfilled.
- New editor orders use `desk-{requestId}` and carry `workflowRequestId`. Batch request identities include delivery date and customer ID. Legacy IDs continue to work. Retry checks both the request identity and original actor before reusing a record.
- Orders first confirmed printed through the updated flow receive `workflowPrintRewardEligible: true`. This allows a partially completed confirmation to retry its reward without awarding historical reprints.
- Newly created invoices carry `workflowCreateRewardEligible: true`, allowing their creation reward to recover after a local queue write failure. Older invoices without this marker are not backfilled.
- Drafts, reviewed batches, preferences, background jobs, and 30-day workflow measurements are stored per signed-in account in this browser. Background jobs resume when that account opens the app online. They do not run while the app is closed. Clearing browser storage removes these local records; committed orders and invoices remain in Firestore.
- Deploy application version 2.57 and its generated service worker together through the `main` branch's GitHub Pages build, after publishing rules to `oa-kyrgyz-organic`.
- The repository's Storage rules have been reconciled with the existing production rules, preserving campaign images, hamster-spin images, store branding, and store media folders alongside invoice PDFs and logos. This does not change production Storage permissions.

## Compatibility checks

Run `npm run check` and `npm run test:rules` before production rollout. The rules suite runs actual order saves, invoice-number and inventory transactions, print confirmation, reward receipts, all five supported staff roles, rejected private access, customer QR/approval paths, and Storage uploads against isolated local emulators. The browser fixture covers batch interruption and recovery. Check full-page and two-up output on the actual office printer with browser headers/footers off and the matching paper size. The existing Apps Script endpoint uses opaque browser responses: delivery can be retried after network failures, but the app cannot verify that the spreadsheet applied an opaque response.

Rollback can restore the prior application assets. Leave the additive receipt rules and fields in place. They do not affect the old application. Avoid running old and new reward-producing clients together during rollout because old clients do not use receipts.
