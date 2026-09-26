# Version 2.70 — Collections and Inventory reliability

All eight recommendations from the 2.69 audit are addressed.

## Changes

- Production edits run through Firestore transactions. Retries read current invoice counters, and production saves never write invoice-owned counters back. Per-product serialization orders overlapping edits and lock operations.
- Lock actions only change lock state on existing records. New records receive the minimum fields required by the existing schema. Locked quantities cannot be edited until unlocked.
- Save failures retain the entered quantity with Retry save. Controls prevent a refresh or lock from discarding a failed draft. Bulk operations return per-product results, and a repeated failed bulk action retries only failed products.
- Initialization and import retain failed entries, remember successful products, and close only after completion. Transactions refuse to overwrite a product already initialized by another user. An empty import produces a useful error. Import is limited to products in the current initialization dialog.
- Daily reads distinguish server data from cached data. Cached stock is labeled and read-only. Failed reads cannot masquerade as an empty day or disabled inventory; initialization requires a server-confirmed empty day. Missing settings also produce a retryable error. Refresh failures retain the previous table.
- Both tabs reject obsolete requests after navigation and older requests on the same route. Payment saves still update shared state after navigation, without reopening Collections.
- Collections respects explicit zero balances, includes unpaid partially returned orders, and uses returnSummary.adjustedTotalAmount when present before subtracting payment amounts. Paid and archived orders retain their existing exclusion policy. The metric label now says Critical balances, matching its count of orders.
- Quantities must be finite and nonnegative. Blank input is unfinished, not zero. Fractional quantities remain supported. Dates and product identifiers are validated.
- Collections Refresh now awaits the entire request, disables duplicate clicks, preserves data on error, and displays the shared oven percentage indicator after 100 ms. Inventory operations use the same indicator. Percentages for requests with no measurable total remain explicitly labeled Estimated.

## Validation

- npm run check: **276 tests passed**, followed by a successful service-worker build with **329 precached files**.
- Eleven new permanent regression tests cover counter interleaving/retry, field-specific locks, failed and partial writes, protected initialization, empty imports, authorization, serialized edits and locks, cache/read failure, quantities, balances, and route/request ownership.
- Playwright browser checks against the real views/components with fixture services passed: failed edit preservation and retry; fractional totals; slow Inventory navigation; Collections refresh percentage and failure recovery; payment completion after navigation; partial initialization retry of failed products only; mobile rendering.
- UI screenshots and the browser fixture are under output/playwright/inventory-audit. Cloud inventory and payment records were not modified for testing.

## Compatibility and architecture

The four new intents (SaveProductionRecordIntent, SetInventoryLockStatusIntent, InitializeInventoryDayIntent, ImportInventoryDayIntent) include all six required ICF stages through the existing stage registries. Each product write is atomic; multi-product actions report partial results explicitly. Collections payment continues using UpdateOrderStatusIntent. New application helpers use named traditional functions, explicit conditions, and no optional chaining, arrow functions, nullish coalescing, or Crypto API. Existing unrelated legacy code is retained.

No data migration, Firestore rule change, or Dexie schema change is required. Transactional writes need a working connection and retain failed entries for retry. Historical counter damage is not automatically repaired because this release cannot infer the correct historical values safely. A future report with affected product/order IDs can establish whether repair is needed. Financial totals rely on stored return summaries being accurate; this release does not introduce partial-payment capture or change archived-debt policy.

## Changed files

- deployment-version.json
- docs/collections-inventory-audit-2.69.md
- docs/release-2.70.md
- index.html
- js/ICF/Intents/ImportInventoryDayIntent.js
- js/ICF/Intents/InitializeInventoryDayIntent.js
- js/ICF/Intents/SaveProductionRecordIntent.js
- js/ICF/Intents/SetInventoryLockStatusIntent.js
- js/ICF/Intents/inventoryIntentFactory.js
- js/ICF/Stages/Authorizers/Inventory/authorizeInventoryMutation.js
- js/ICF/Stages/Authorizers/authorizers.js
- js/ICF/Stages/ContextProviders/Inventory/addInventoryMutationContext.js
- js/ICF/Stages/ContextProviders/contextProviders.js
- js/ICF/Stages/Emitters/Inventory/emitInventoryMutationResult.js
- js/ICF/Stages/Emitters/emitters.js
- js/ICF/Stages/Normalizers/Inventory/normalizeInventoryMutation.js
- js/ICF/Stages/Normalizers/normalizers.js
- js/ICF/Stages/Processors/Inventory/processInventoryMutation.js
- js/ICF/Stages/Processors/processors.js
- js/ICF/Stages/Validators/Inventory/validateInventoryMutation.js
- js/ICF/Stages/Validators/validators.js
- js/config.js
- js/controllers/inventoryController.js
- js/core/inventoryValidation.js
- js/core/viewRequestGuard.js
- js/service-worker/source-sw.js
- js/services/inventoryService.js
- js/services/operationsPlanningService.js
- js/views/collectionsView.js
- js/views/inventoryView.js
- scripts/build.cjs
- sw.js
- tests/inventory-collections-reliability.test.mjs
