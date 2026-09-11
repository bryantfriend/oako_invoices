# Invoice productivity — version 2.57

Release 2.57 implements all five improvements. The application is published through GitHub Pages and uses the `oa-kyrgyz-organic` Firebase project.

## What changed

1. **Create, print, next customer.** The order editor now has Save order and Save & print invoice actions. It prepares the existing numbered invoice, remembers full-page/two-up layout, recovers unfinished drafts, and opens a fresh editor after confirmed printing. Ctrl+Enter saves and prints; Ctrl+S saves; Alt+P opens the catalog; Enter in a quantity advances to the next quantity. Quantities update immediately, including when saving before leaving a field. The editor adapts to narrow screens.
2. **Daily invoice batch.** The sidebar and command palette open a worksheet populated from regular customers' order history. Operators review quantities and current catalog price warnings, select customers, prepare missing invoices, print, or export a combined PDF. Existing orders retain their saved prices. Each completed row is checkpointed; retries reuse saved orders and invoices. An order created after loading the worksheet is shown for review before reuse. The Orders toolbar can also prepare invoices for an existing selection.
3. **Shorter waits.** Sheets upserts and workflow XP run through a durable, account-scoped background queue, with retry/backoff and a manual retry control. Sheets jobs wait for their corresponding order update to commit. Requests time out instead of holding the worker indefinitely. The new direct HTML print path reuses the existing invoice template, QR generation, and numbering; the existing combined PDF exporter remains available.
4. **Useful workflow analytics.** Invoice rhythm shows local 30-day median active entry time, preparation time, batch time, failures, reprints, and corrections. Entry measurements exclude gaps over 30 seconds. Return-based suggestions use at least three completed orders, show their evidence, and require an explicit click to apply. Applying a suggestion does not trigger repeated quantity reductions. Compact work view starts enabled and can reveal the analytics when needed.
5. **Optional bakery progress.** A shared daily tray uses the actual saved orders and confirmed print status. Staff can opt into progress, sounds, and animation. Reduced-motion preferences are respected. Workflow XP uses immutable receipts written with the user counters in one transaction, preventing repeated rewards for retries or repeated print confirmations. The daily tray itself does not add XP.

Browser print dialogs cannot prove that paper printed. The preview therefore has a separate **Paper printed successfully** confirmation. Cancelled printing remains unconfirmed, and a failed status save can be retried without printing again.

## Verification

- `npm test`: 164 tests pass, including the existing 150 tests and 14 new workflow tests.
- `npm run test:rules`: 11 Firestore/Storage emulator integration tests cover all five staff roles with the actual order save, invoice numbering, inventory, print-confirmation, and reward services; retries, immutable receipts, private-access denials, public QR/approvals, and shared media/PDF paths are checked too. Test dependencies match the browser's Firebase SDK 10.7.1.
- Production Firestore and Storage rules were deployed on September 11, 2026 and read back to verify they match the tested files. Firestore ruleset: `43682838-2bdc-4dac-9293-8825898c8dbd`. Storage ruleset: `4b8659bf-9a1a-4963-afe2-bed88385ee67`; its contents match the previous production Storage release.
- `npm run build`: version 2.57 service worker generated with 285 precached files.
- Full application import/bundle check passes, with remote Firebase imports left external.
- Browser checks used the real editor, batch, ICF workflow, print template, HTML printer, and PDF exporter with isolated local fixture data. No production records or physical printer were used.
- Checked save/preparation failure, reload recovery, reuse of saved identities, partial batch recovery, exact quantity capture with Ctrl+S, Enter navigation, explicit print confirmation, preservation of another tab's later draft, full-page and odd-count two-up output, QR images, mobile sizing, optional bakery completion, and retention of the PDF exporter.
- A local 10-invoice two-up rendering sample took **187 ms** for direct HTML preparation and **2,666 ms** for the existing PDF exporter. Both produced the same 10 invoice pages; the PDF was 4,460,566 bytes. This is one synthetic local sample, excluding Firebase, operator time, the browser print dialog, and physical printing.

To repeat the isolated UI checks, run `node scripts/build-workflow-preview.cjs --serve`, then open `http://127.0.0.1:8766/`. The fixture writes only its own local browser records. Set `window.__workflowFixture.failPrepare = true` in that fixture to interrupt its next preparation. `window.runInvoiceFixtureBenchmark(10, 'two-up-portrait')` compares both renderers without sending anything to a physical printer. Close the fixture server after testing.

## Rollout and limits

See `invoice-productivity-migration.md` for the additive rules/data rollout and rollback plan. Existing invoices, numbering, price overrides, audit records, and PDF printing remain compatible. No backfill or destructive migration is required.

Drafts, pending background work, preferences, and workflow measurements belong to the current account on this browser. Jobs resume while the app is open and online; clearing browser storage removes local pending work. The bakery uses the shared order records loaded by the screen; reload to fetch other staff members' latest changes. The existing Sheets webhook returns opaque responses, so the browser can detect transport failures but cannot verify that the spreadsheet applied a successful opaque response.

The three new registered Intents—SaveAndPrepareInvoiceIntent, PrepareInvoiceBatchIntent, and RunWorkflowEffectIntent—each include Validate, Normalize, AddContext, Authorize, Process, and Emit. Existing invoice preparation and print confirmation retain their ICF pipelines. New workflow JavaScript uses traditional functions and avoids arrow functions, optional chaining, nullish coalescing, and the Crypto API. Unrelated legacy syntax is preserved.

## Changed files

The file manifest below includes application code, additive rules, tests, documentation, and release assets. Local browser artifacts and raw verification logs are ignored by Git.
```text
.gitignore
README.md
css/styles.css
deployment-version.json
docs/invoice-productivity-migration.md
docs/invoice-productivity.md
firebase/firestore.rules
firebase/storage.rules
firebase.emulators.json
index.html
js/components/createOrderWorkflow.js
js/components/globalCommandPalette.js
js/components/invoiceProductivityPanel.js
js/components/sidebar.js
js/config.js
js/controllers/invoiceController.js
js/controllers/orderDetailController.js
js/core/constants.js
js/core/invoiceProductivity.js
js/ICF/Intents/intents.js
js/ICF/Intents/PrepareInvoiceBatchIntent.js
js/ICF/Intents/RunWorkflowEffectIntent.js
js/ICF/Intents/SaveAndPrepareInvoiceIntent.js
js/ICF/Stages/Authorizers/authorizers.js
js/ICF/Stages/Authorizers/Workflow/authorizeInvoiceWorkflow.js
js/ICF/Stages/ContextProviders/contextProviders.js
js/ICF/Stages/ContextProviders/Workflow/addInvoiceWorkflowContext.js
js/ICF/Stages/Emitters/emitters.js
js/ICF/Stages/Emitters/Workflow/emitInvoiceWorkflowResult.js
js/ICF/Stages/Normalizers/normalizers.js
js/ICF/Stages/Normalizers/Workflow/normalizeInvoiceWorkflowPayload.js
js/ICF/Stages/Processors/Invoices/processMarkInvoicePrinted.js
js/ICF/Stages/Processors/processors.js
js/ICF/Stages/Processors/Workflow/processPrepareInvoiceBatch.js
js/ICF/Stages/Processors/Workflow/processRunWorkflowEffect.js
js/ICF/Stages/Processors/Workflow/processSaveAndPrepareInvoice.js
js/ICF/Stages/Validators/validators.js
js/ICF/Stages/Validators/Workflow/validateInvoiceWorkflowPayload.js
js/main.js
js/service-worker/source-sw.js
js/services/gamificationService.js
js/services/googleSheetsService.js
js/services/invoiceService.js
js/services/invoiceWorkflowService.js
js/services/nativeInvoicePrintService.js
js/services/orderService.js
js/services/syncService.js
js/services/workflowEffectsService.js
js/services/workflowLocalStore.js
js/views/createOrderView.js
js/views/dailyInvoiceBatchView.js
js/views/dashboardView.js
scripts/build-workflow-preview.cjs
scripts/build.cjs
scripts/test-firebase-rules.cjs
package.json
package-lock.json
tests/firebase-rules.integration.mjs
scripts/workflow-preview-benchmark.js
sw.js
tests/invoice-productivity.test.mjs
```
