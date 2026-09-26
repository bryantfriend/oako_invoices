# Version 2.71 — Unlocking, starting quantities and animated baking

## User-facing changes

- Unlock and Unlock & edit quantities remain available with cached data. Every mutation still uses a transaction to check server state and acknowledge the save. Failed quantity drafts cannot disable the recovery unlock. Unlocking restores the visible input border/background as well as its editable state. Lock controls have explicit action labels.
- Inventory now has a Daily starting quantities editor. It loads saved defaults, accepts nonnegative fractional quantities, can copy today’s saved totals into the form, and retains edits on save failure. Saving defaults leaves today’s production unchanged. A new day’s initialization form prefills those defaults for review and confirmation.
- Only changed defaults are merged into the latest settings in a single transaction, preserving other products and category settings. See inventory-defaults-migration.md for the additive optional field and rollback behavior.
- The shared oven scene changes from flattened pale dough to risen bread and then a golden crust as progress increases. Flames flicker, heat rises, and chimney steam moves continuously. Baking-stage captions explain the visual progression. The same renderer serves main-screen loaders and print waiting documents. Reduced-motion preferences disable continuous motion while preserving progress-linked visual stages. Unmeasured percentages remain explicitly estimated; completion is still tied to actual work.

## Validation

npm run check passed: **279 tests**, successful build, **331 precached files**. The full application module graph also bundles successfully.

New regression coverage checks atomic default changes, preservation of today’s quantities and unrelated defaults, validation/denial before writes, and changing loaf height/color/stage at measured percentages. Browser tests exercised cached unlock, recovery from failed drafts, unlocked-field styling, defaults save/retry and new-day prefill, differences between 0/35/75/100 percent frames, actual changing flame transforms, and reduced-motion handling. Screenshots are under output/playwright/inventory-audit. Browser services were fixtures; no customer inventory was changed for verification.

## Architecture and limits

SaveInventoryDefaultsIntent includes Validate, Normalize, AddContext, Authorize, Process and Emit through the existing stage registries. Existing production and lock intents remain in use. New application code follows the project’s named-function style; visual animation remains presentation code. Defaults are an optional additive settings map and require no backfill or rule changes. Saving/unlocking still requires a working server connection; failures stay visible and retryable. Defaults prefill a confirmed empty day, and never automatically replace existing production records.

## Changed files

- css/oven-loading.css
- deployment-version.json
- docs/inventory-defaults-migration.md
- docs/release-2.71.md
- index.html
- js/ICF/Intents/SaveInventoryDefaultsIntent.js
- js/ICF/Stages/Processors/Inventory/processInventoryDefaults.js
- js/ICF/Stages/Processors/processors.js
- js/ICF/Stages/Validators/Inventory/validateInventoryMutation.js
- js/components/ovenLoading.js
- js/config.js
- js/controllers/inventoryController.js
- js/service-worker/source-sw.js
- js/services/inventoryService.js
- js/views/inventoryView.js
- scripts/build.cjs
- sw.js
- tests/inventory-collections-reliability.test.mjs
- tests/oven-loading.test.mjs
