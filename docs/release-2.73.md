# Version 2.73 — Orders inventory refresh reliability

Orders now requests fresh inventory records both on entry and when refreshing stock. After a dashboard refresh, inventory reuses the orders just loaded instead of issuing a duplicate forced order refresh. Failed order refreshes propagate their error without replacing existing rows with an empty list. Inventory failures no longer prevent successfully refreshed orders from rendering; previous stock is retained with an error notification. An empty stock strip keeps Refresh Stock and Open Inventory controls available.

Validation: all 286 tests pass, including regressions for fresh inventory requests, failed dashboard reads, inventory failures, recovery controls, and reuse of freshly loaded orders. The production build succeeds. Manual verification: save an invoice as printed, return to Orders, and compare today's quantities with Inventory. Retry Refresh Stock after a temporary connectivity failure and confirm existing orders remain visible.

The existing six-stage ICF printing and data-loading pipelines are preserved. No new intents or schema/rule changes are required. Added application code follows the project's explicit-condition and named-function style. Offline inventory may still show cached quantities; refreshing requires connectivity to obtain current server records.

Changed files:

- js/controllers/dashboardController.js
- js/controllers/inventoryController.js
- js/views/dashboardView.js
- tests/dashboard-reconciliation-fallback.test.mjs
- tests/inventory-order-counts.test.mjs
- tests/orders-inventory-strip.test.mjs
- scripts/build.cjs
- deployment-version.json
- index.html
- js/config.js
- js/service-worker/source-sw.js
- sw.js
- docs/release-2.73.md
