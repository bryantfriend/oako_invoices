# New Order starts blank — version 2.60

The editor previously restored `draft/editor` on every visit. The previous release made an archived draft recoverable, but that did not stop the same old customer and items from appearing automatically. A second path ignored clicking New Order when that route was already active.

## Behavior

- Opening New Order or reloading it starts with a blank customer and no products. The normal delivery-date and pricing defaults remain.
- A visible **Resume previous draft** action identifies the previous customer. Recovery is explicit and retains the saved order/request identifiers so interrupted saves still retry without duplication. The old archived-order recovery from 2.59 remains available after an intentional resume.
- Merely visiting an empty editor does not overwrite the stored draft. Starting another order keeps the preceding draft in the same account's `draft/previous-editor` recovery slot before writing the new active draft. This is a current/previous recovery buffer, not an unlimited draft history.
- Resuming while new entries are present asks before switching and keeps those entries as the previous draft. A failed local-storage write prevents the switch or new-order save.
- Clicking New Order on the already-active route starts a blank editor and preserves the current entries for recovery. It does not create or archive database records.
- Explicit Repeat Order still loads the requested basket with a fresh save identity.
- A late print confirmation clears only matching finished draft content. It cannot erase newer quantities or another tab's different draft. Unchanged completed recovery copies are cleared together.

## Verification

`npm run check` passed **190 tests** and built version 2.60 with 286 precached files. Seven new behavioral regressions cover repeated blank visits/reloads, explicit resume, preserving old work when typing a new order, swapping/cancelling recovery, Repeat Order identity, late print confirmation, storage failure, and the actual router's active New Order action. Existing archived-draft and save/print retry tests now resume explicitly.

The browser fixture retained the reported four bread lines at quantity 3 and price 92 in storage while displaying an empty new order. Resume restored the customer, all four quantities, prices and total 1,104 сом; reloading returned to an empty editor with recovery still available. The final blank-editor check verified the stored request and all four quantities were retained. The missing local fixture favicon is unrelated; the app had no runtime errors.

Firebase rules, order/invoice services, numbering and cloud data formats are unchanged. There is no database migration. This change adds only an account-scoped local recovery slot, compatible with existing stored drafts. Production verification is read-only; no customer records are changed for testing.

## Rollout

Deploy application assets and the generated service worker together through GitHub Pages. Existing sessions should select **Update now**, then open **New Order**. Use **Resume previous draft** only when continuing the earlier order. No browser-storage clearing is needed.

All persistent save/print actions still use the existing registered intents and all six stages: Validate, Normalize, AddContext, Authorize, Process and Emit. The added local editor/navigation behavior does not bypass cloud authorization. Changed application code follows the project's function/style rules; unrelated legacy syntax is preserved.

## Changed files

```text
deployment-version.json
docs/invoice-new-order-preload.md
index.html
js/components/createOrderWorkflow.js
js/config.js
js/router.js
js/service-worker/source-sw.js
js/views/createOrderView.js
scripts/build.cjs
sw.js
tests/invoice-draft-recovery.test.mjs
```
