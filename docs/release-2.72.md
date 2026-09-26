# Version 2.72 — Return to Orders after Save Order

After New Order successfully completes Save Order (including Ctrl+S), the active editor navigates to the Orders tab. Validation/save failures keep the editor open. A save finishing after navigation does not reopen Orders. Save & print retains its existing flow, and draft checkpoints remain available for recovery.

Validation: npm run check passed all 281 tests and built 331 precached files. New regression tests cover successful navigation, failed saves, and a departed editor. To verify manually, create a valid New Order and click Save Order: the Orders tab should open after saving.

This is a presentation navigation change; the existing six-stage invoice/order ICF save pipeline remains unchanged. Added code uses explicit conditions and existing project routing. No schema change or migration is needed.

Changed files:

- js/components/createOrderWorkflow.js
- tests/invoice-draft-recovery.test.mjs
- scripts/build.cjs
- deployment-version.json
- index.html
- js/config.js
- js/service-worker/source-sw.js
- sw.js
- docs/release-2.72.md
