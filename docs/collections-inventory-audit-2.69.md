# Collections and Inventory audit — 2026-09-26

Audited release 2.69, commit 890ec98d4ff54e280e3ee251de6eba36ac3ba707. This is a read-only application audit: no production data was accessed or changed, and no application fixes or deployment were made. Ten deterministic checks against the current modules reproduced the behaviors below using isolated service/DOM fixtures. These are confirmed code defects or data-conditional behaviors, not a claim that every case has occurred in the user's account.

## Findings, ordered by priority

### 1. [P1] Inventory reports success when writes fail

**Code:** `js/services/inventoryService.js:163` (`saveProductionRecord`), `js/controllers/inventoryController.js:113` (`bulkUpdateLockStatus`), `js/views/inventoryView.js:140`, `:235`.

The service catches write errors and returns `false`. Individual edits ignore that value and reload the screen. Bulk locking and initialization await `Promise.all` but do not inspect its resolved values; a resolved `false` is treated as success. Failed edits can therefore disappear without a useful explanation, while bulk actions show a success notification. Import Yesterday similarly reports success when its source records are empty.

**Reproduction:** Both mocked writes returned `false`; bulk lock still returned `true` and emitted `msg_update_success`. Importing an empty source also returned `true`.

**Fix:** Use an explicit result or throw on failure; check every product result. Keep failed entries editable, preserve the user's values, list failed products, and retry only those products. Do not close initialization or report complete success after partial failure. Distinguish “nothing to import” from a successful import.

### 2. [P1] Lock All / Unlock All can overwrite newer baked totals

**Code:** `js/controllers/inventoryController.js:118`.

The lock operation resends `totalBaked` from the page's original category snapshot. If another browser or a pending edit has saved a newer total, clicking a lock control can write the old total back. Locking should not modify production quantities.

**Reproduction:** The stored total was 80 and the visible snapshot was 50. Lock All changed the stored total to 50.

**Fix:** Write only the lock field and timestamp for lock actions. Keep quantity editing separate, serialize overlapping edits for a product, and prevent bulk actions from racing unsaved edits.

### 3. [P1] Production saves can erase concurrent invoice-counter changes

**Code:** `js/services/inventoryService.js:167`; compare inventory deltas in `js/services/dataIntegrityService.js:212`.

Production saving reads the document, then writes the previously read `invoiceQuantity` and `returnedQuantity` back with `setDoc`. An invoice operation can update those counters between the read and write. A merged write does not protect fields explicitly included in the payload.

**Reproduction:** Invoice quantity was read as 5, then independently changed to 9 before the production save. The production save restored it to 5.

**Fix:** Use a transaction when changing production and recomputing derived availability, or avoid writing counters owned by invoice operations and update derived availability through the existing integrity flow. The main Inventory view currently derives displayed reservations from orders, so corruption in stored counters can be masked there; this is not proof that its displayed Ordered column immediately changes.

### 4. [P1] A failed inventory read can look like an empty day

**Code:** `js/services/inventoryService.js:140` / `:156`; `js/controllers/inventoryController.js:99`; `js/views/inventoryView.js:22` / `:39`.

A daily-inventory read failure returns `{}`. The controller fills missing products with zero production and unlocked state, and the view interprets those zeros as a day needing initialization. Separately, a broader controller failure returns `[]`, which the view describes as “No Inventory Enabled.” A connection or permission failure is not evidence that records or settings are absent.

**Reproduction:** A thrown `unavailable` read error became an empty records object. Following the current defaults and initialization condition would display zero production and offer initialization when product/settings reads succeeded.

**Fix:** Return data availability explicitly. Preserve the last known stock, show stale/unavailable feedback with Retry, and allow initialization only after a successful read confirms the day is empty.

### 5. [P2] Slow requests can overwrite the tab opened afterward

**Code:** `js/views/collectionsView.js:133`, `js/views/inventoryView.js:19`, including the rerenders called by save/refresh handlers.

Both views write into the shared page container after an awaited load without checking that their route/request is still current. The router's later stale-result check runs after the view has already modified the DOM. A payment or inventory save completing after navigation can also invoke the old view again. Repeated refreshes on the same route need their own request ordering guard.

**Reproduction:** Started each real view with its loader deferred, replaced the page with another screen, then completed the old request. In both cases the old view overwrote the newer screen.

**Fix:** Check route ownership and a per-view request sequence before painting or opening dialogs. Update shared records after successful saves, but rerender only if the originating view remains active. Do not cancel an already-issued mutation merely because the user navigated away.

### 6. [P2] Collections can overstate a settled balance or hide a return-adjusted balance

**Code:** `js/services/operationsPlanningService.js:60`, `:105`.

An explicit `balanceDue: 0` / `outstandingAmount: 0` is ignored because only positive explicit balances are honored; the function falls back to total minus paid fields. The queue also excludes `partially_returned` entirely, even though that is a supported order status and some of those orders can still have a positive net balance.

**Reproduction:** A confirmed order with total 1,000 and explicit balance 0 appeared owing 1,000. A partially returned order with total 700 was omitted.

**Fix:** Distinguish missing values from a valid zero, normalize finite monetary values, and calculate eligibility from the canonical remaining receivable and business state. Confirm how return credits, archived debts and payment status should affect this queue before changing financial inclusion rules. The zero-balance case is data-conditional: this audit did not establish that these optional legacy fields exist in current production records.

### 7. [P2] Production input is silently coerced instead of validated

**Code:** `js/views/inventoryView.js:139`, `:150`, `:235`; `js/services/inventoryService.js:169`; `js/core/inventoryQuantities.js:3`.

Inputs have no application-level nonnegative validation. `parseInt(value) || 0` turns a blank edit into zero and truncates decimals; negative totals can be saved. The inventory display later clamps a negative total to zero, masking the stored value.

**Reproduction:** The production save accepted and persisted -5.

**Fix:** Validate finite, nonnegative quantities before writing. Decide whether fractional quantities are supported; then reject or preserve them consistently. Treat an empty field as unfinished input rather than automatically erasing the saved total.

### 8. [P2] Collections Refresh still has a silent waiting period

**Code:** `js/views/collectionsView.js:151`.

Refresh starts `refreshOrders(...).finally(renderCollections)` without awaiting or returning the request, disabling the button, or starting the oven indicator. The loader appears only later when the view rerenders. The callback also lacks a rejection handler and invokes its rerender even if the user has left Collections.

**Reproduction:** While a deferred refresh remained pending, the callback returned `undefined`, the page stayed unchanged, and the button remained enabled. This is a missed foreground-loading path in release 2.69.

**Fix:** Make Refresh one tracked async operation, disable/deduplicate it while pending, handle failure explicitly, and use the route/request guard from finding 5. The oven should cover the actual refresh request, not just the later rendering stage.

## Recommended implementation order

1. Preserve write failures and existing data; stop failed reads from offering initialization.
2. Make lock writes field-specific and make production/counter updates concurrency-safe.
3. Add route/request guards, per-product pending controls, and complete refresh loading feedback.
4. Validate quantities and add regression tests for blur/change plus lock/bulk-action races.
5. Agree the Collections return-credit/payment inclusion rules, then correct and test its calculations.

## ICF architecture recommendations

Inventory mutations currently run directly through the controller/service. The repository requires meaningful mutations to use ICF. The lowest-risk migration keeps existing Firestore document IDs and schema and moves existing operations behind small intent stages, without redesigning all inventory reads.

| Candidate action | Current entry points | Recommended intent |
| --- | --- | --- |
| Save baked quantity | inventory view change handler → inventoryController.saveProduction → inventoryService.saveProductionRecord | SaveProductionRecordIntent |
| Lock/unlock products | row lock handler and inventoryController.bulkUpdateLockStatus | SetInventoryLockStatusIntent |
| Initialize a day | showInitializationModal confirmation → multiple saveProduction calls | InitializeInventoryDayIntent |
| Import prior-day production | inventoryController.importYesterday | ImportInventoryDayIntent |
| Record collection payment | Collections Mark paid → existing UpdateOrderStatusIntent | Keep the existing six-stage intent for simple full-payment status; introduce RecordCollectionPaymentIntent only if payment amounts, invoice linking or partial-payment semantics are added |

Each new intent needs **Validate → Normalize → AddContext → Authorize → Process → Emit**, with one stage per file and the existing registries. Validate dates, product IDs and quantities; normalize identifiers and quantities; add the current actor and fresh relevant records; authorize existing staff/store access; process safe writes and partial results; emit cache updates, accurate status and retryable errors. Existing UpdateOrderStatusIntent already uses all six stages.

Do not introduce full ICF merely for loading animation, DOM rendering, local filters, route guards or pure balance/quantity calculations. Those are presentation or pure helpers, not independent business mutations.

## Evidence and limits

- Existing baseline: **265 tests passed**; those tests did not catch these failure/interleaving cases.
- Reproduction script: `output/audit-collections-inventory.mjs` (runs the actual isolated modules with deterministic storage/network/DOM fixtures).
- Results: `output/collections-inventory-audit-results.json`.
- Baseline log: `output/collections-inventory-audit-baseline.log`.
- No live payment, inventory record, customer message, or cloud write was used to test these scenarios. Actual user steps, device and affected record IDs are still needed to identify which confirmed defect explains their complaint.
- Application source and deployed version remain unchanged. This audit report and local reproduction artifacts are the only additions.
