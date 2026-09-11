# Saved-draft print recovery — version 2.59

The editor retained both the saved order ID and its stable creation request after the order was archived. Save & print then rejected that record, and every retry reused the same identity. Clearing only the order ID would still find the archived record through its creation request. This path reproduces the reported “saved order is unavailable or archived” popup; the screenshots do not identify a particular database record.

## Corrected behavior

- A confirmed missing or archived order, or an archived invoice, produces an actionable message. The popup has **Return to editor**, and the editor offers **Save as new order** and **Save as new order & print**.
- Choosing that explicitly labelled action preserves the customer, delivery date, notes, price mode, products, prices and quantities. Both identifiers change. The replacement draft is stored locally before any remote save, so a lost response or browser restart retries the same replacement instead of creating another order.
- A full local-storage failure stops recovery before creating an order. Connection and permission failures retain the original retry identity and do not offer new-order recovery.
- Changing the customer or delivery date cannot overwrite a previously saved order through this editor. Changed products, quantities, prices or notes cannot silently reprint a locked invoice. Matching locked invoices remain available to reprint; active draft quantities remain editable on the same order.
- Archived records stay archived. Existing order and invoice records, invoice numbering and Firebase schemas require no migration. Daily batch retains its existing review/retry behavior and never automatically replaces archived rows.

## Verification

- `npm run check`: **183 tests passed**, including nine new regression tests using the actual SaveAndPrepareInvoiceIntent, all six ICF stages and the real editor adapter. The build produces version 2.59 with 286 precached files.
- `npm run test:rules`: **11 integration tests passed** against local Firestore and Storage emulators, covering the supported staff roles, save/retry, invoice numbering, printing, archival, rewards and public/private access. Rule sources are unchanged.
- Browser fixture: recovered an archived draft with four Cyrillic bread lines, each quantity 3 at 92 сом. Return to editor and Save as new order & print produced one replacement order and one invoice, total **1,104 сом**, preserving the archived order. The print preview rendered and its confirmation reset the editor. The only workflow warning was the expected handled archival rejection; there were no application console errors. The fixture's missing favicon is unrelated.
- Automated recovery cases include confirmed missing records, archived request-ID reuse, connection/permission failures, changed customer/date, locked invoice changes, active draft edits, interrupted preview, lost save response, reload/repeated retry, storage failure and save-only recovery.
- Production tests are read-only; no customer orders or invoices are created for verification. Physical printer output is not part of the automated test: local browser tests intercept the native print call and verify its document and confirmation flow.

## Rollout and user recovery

Publish the application and generated service worker together through the existing GitHub Pages deployment. In an existing session, select **Update now**, then return to the editor. Close an old failed print window and try Save & print again. If the saved record was archived or cannot be reused, select **Save as new order & print**. The entered quantities remain in the editor; clearing browser storage is unnecessary.

Rollback is the preceding application release. The data remains compatible. Recovery deliberately creates a separate order only when the user chooses the new-order action; it does not restore or modify the previous record.

All persistent invoice actions continue through the registered SaveAndPrepareInvoiceIntent: Validate, Normalize, AddContext, Authorize, Process and Emit. Typed error information is preserved only at the workflow service boundary; the shared ICF engine is unchanged. New application functions follow the project style (traditional named functions; no arrow functions, optional chaining, nullish coalescing or Crypto API).

## Changed files

```text
deployment-version.json
docs/invoice-draft-recovery.md
index.html
js/components/createOrderWorkflow.js
js/config.js
js/service-worker/source-sw.js
js/services/invoiceWorkflowService.js
scripts/build.cjs
sw.js
tests/invoice-draft-recovery.test.mjs
```
