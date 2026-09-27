# Version 2.75 — Bakery progress on Orders

The Orders bakery bar now counts all active orders, with an explicit scope label, instead of counting only orders dated today while the list below shows all dates. Empty messages explain the scope rather than asking existing users to create their first order. The daily invoice batch still counts its selected date. Date matching supports Firestore timestamps and cached timestamp objects. Archived and cancelled orders remain excluded, duplicates count once, and printed status still requires confirmation.

Validation: 293 tests passed and the production build completed. Regression coverage includes older and future orders, duplicates, archived/cancelled orders, cached/Firestore dates, rendered bread icons and the daily empty message. Manual check: open Orders with older active orders and confirm the bread bar shows their count; open a daily batch with no orders and confirm its date-specific message.

This is a display calculation change; existing six-stage ICF workflows remain unchanged. Added application functions use named callbacks and explicit conditions. No schema or permission changes. The Orders bar intentionally covers all active orders, independently of table search filters.

Changed files: js/core/invoiceProductivity.js; js/components/invoiceProductivityPanel.js; tests/bakery-progress.test.mjs; scripts/build.cjs; js/config.js; js/service-worker/source-sw.js; index.html; deployment-version.json; sw.js; docs/release-2.75.md.
