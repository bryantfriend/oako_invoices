# Historical matches and daily sales

Confirmed product matches could disappear from the working catalog when a later read returned stale or empty cached settings. Each new confirmation forces a context reload, so this could make previously confirmed items appear again during the same matching session. The save transaction also learned about other staff confirmations without retaining them in the local cache.

The fix preserves durable cached confirmations before a fallback read can replace them, retains acknowledged saves during subsequent loads, and caches the full mapping snapshot returned by the save transaction. Newer timestamped confirmations take precedence. Confirmation still requires a successful online transaction and uses the existing conflict and category checks.

Orders now displays a separate **Today's Sales** card independent of the chart range. It sums confirmed, fulfilled, paid, and eligible returned orders for the local business date, after returns, including archived sales. Drafts and cancelled orders are excluded. This is sales by order date, not cash collected today. Product matching does not change monetary totals.

If historical match settings or the product catalog are unavailable, Orders retains its records and monetary statistics and displays a notice explaining that product totals may use historical names.

## Changed files

- `js/services/productReconciliationService.js`: cache and transaction reconciliation.
- `js/controllers/dashboardController.js`: resilient Orders loading and daily sales access.
- `js/services/statsService.js`: daily sales calculation.
- `js/views/dashboardView.js`: daily sales card and match availability notice.
- `tests/product-reconciliation.test.mjs`: stale reads, session reloads, concurrent staff confirmations, and newer confirmations.
- `tests/dashboard-reconciliation-fallback.test.mjs`: failed settings reads and unavailable product catalogs.
- `tests/daily-sales.test.mjs`: returns, archival, pending matches, date boundaries, and excluded orders.
- `tests/orders-inventory-strip.test.mjs`: updated view harness for reconciliation availability.
- `sw.js`: regenerated production precache manifest.

## Verification

Run `npm run check` for the full unit suite and production build.

Manual acceptance: confirm an old product name, refresh Orders, and reopen the matching dialog. The saved identity should remain resolved. Repeat with a fresh browser session. Select Day, Month, or All in Orders; Today's Sales should continue showing the current local date's net confirmed sales. Check one confirmed order with a return and one archived sale against the displayed amount.

## Compatibility and limits

Packaged in release 2.61 together with the order-deletion and two-copy printing fixes. No database schema, Firebase rules, historical invoices, or order records are changed. Cache regressions are reproduced with controlled test doubles; signed-in browser acceptance remains a release follow-up. Distinct historical ID/name/category identities still require distinct confirmations, and a retired target still needs a replacement match.

The existing `ConfirmProductMatchIntent` retains Validate, Normalize, AddContext, Authorize, Process, and Emit. No new mutation intent is introduced. Added JavaScript follows the project style rules with traditional functions and explicit conditions.
