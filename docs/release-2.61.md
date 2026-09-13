# Release 2.61

- Preserve confirmed historical product matches across stale cache reads and refreshes.
- Show today's net confirmed sales separately from the Orders chart range.
- Keep Orders and monetary statistics available if historical-match data cannot load.
- Clear server-confirmed missing order rows and prevent stale refreshes from bringing them back.
- Preserve concurrent/local order changes and existing legacy archives.
- Print two copies of every invoice page in all 2-up Portrait workflows, including odd batches and multi-page invoices.
- Keep duplicate pages mounted while the print preview is open, paginate long Daily Orders, and retain invoice QR images in Quick Print PDFs.

The application and service-worker versions are both 2.61. The offline database schema remains version 3. This release does not change Firebase rules or stored data schemas.

Validation details and manual acceptance steps are in [historical matches and daily sales](historical-match-daily-sales-fix.md) and [order deletion and 2-up printing](order-deletion-two-up-fix.md).
