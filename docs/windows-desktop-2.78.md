# Windows 2.78 changes

## Missing data and startup speed

A fresh desktop profile has its own empty cache. Previously, the connection began in `offline` while startup diagnostics ran. Reads could return the empty cache without trying Firestore, and session data could hold that empty result. An unchecked connection now permits a bounded server read when the operating system reports a network connection. Explicit offline states still use cached data.

The desktop readiness panel now checks installed application files instead of requiring a browser service worker. Data still needs to be loaded once while signed in and online. The web/PWA service-worker readiness check remains active. Cloud collection reads explicitly require a server response so an offline SDK cannot quietly report an empty memory snapshot as current data. A failed server read preserves durable cached rows and reports an error when none exist. Staff-profile verification uses server reads with bounded retries for transient transport failures; permission rejections are not retried.

Firebase CDN imports are resolved through esbuild's browser ESM conditions, avoiding Node's CommonJS wrappers. The package check verifies the browser SDK inputs and absence of test-emulator code.

Account-scoped Orders snapshots render before cloud product reconciliation. Disk-cache hydration preserves the original age and does not rewrite stale data as fresh. Existing background refresh and invoice caching remain in use. Product matching controls become available after background reconciliation.

## Windows printing and filing

Settings → Windows printing and PDF filing saves a printer, copies, paper size, direct-print preference, and PDF folder on this computer. Defaults retain the Windows print dialog, one A4 copy, and no automatic filing. Direct printing requires an installed printer. PDF filing requires a folder selected through the native folder picker.

Individual invoices, Orders Quick Print, and Daily Invoice Batch use the prepared native invoice preview. Full-page and two-up layouts remain supported. Windows Quick Print skips per-page canvas capture and raster PDF generation. Invalid invoices are listed in the preview and omitted explicitly; the PWA keeps its existing PDF workflow.

The preview provides Print invoices, Save PDF, and Paper printed successfully. Automatic filing runs when printing is requested; a cancelled print can still leave its PDF filed. PDFs go into local date folders. Individual filenames include the customer and invoice number; batches use an invoice-count label. Exclusive filenames preserve earlier files. Reprinting a still-open job reuses its filed PDF.

Printer submission and PDF filing never mark an invoice printed. Only the existing staff confirmation action updates invoice/order print status. A filing failure is reported independently and can be retried through Save PDF. Disconnecting the saved printer produces an actionable error; use Settings to change it or restore the Windows dialog.

Only a registered invoice child window belonging to the main app can be printed or exported. The native bridge checks the sending frame; the renderer cannot supply a replacement output folder. Native file access remains restricted to the chosen directory.

## Verification and limits

- All 313 project regression tests passed, and the web build succeeded.
- Hidden Electron with a fresh isolated profile and authenticated Firebase Auth/Firestore emulators: customers, Orders, Invoices, and Settings render; native PDF output is a valid PDF; disk Orders cache reloads; saving a PDF leaves paper unconfirmed.
- Behavioral checks cover unchecked versus explicit-offline reads, staff authorization, six-stage actions, persistent printer settings, unavailable printers, path-safe filenames, restricted print windows, native batch rendering, and cache-first dashboard loading.
- The installed package check verifies shipped native source files, local libraries, Firebase browser modules, absence of emulator fixtures, and the installer/update manifest checksum.

The emulator uses a dedicated `demo-desktop-invoices` project, localhost-only ports, disposable test credentials, and `.workbox/desktop-integration`. It cannot write production business records. Run it with `node scripts/test-desktop-integration.cjs`; run the regular checks with `npm run check`, then build the installer with `npm run desktop:dist` and check it with `node scripts/verify-desktop-package.cjs`.

Physical printing, the user's production account, and an installed 2.77 → 2.78 upgrade have not been tested here. No end-to-end production speed benchmark is claimed. The installer remains unsigned as in 2.77.

## Changed files and architecture

- Desktop build and native host: `desktop/build.cjs`, `main.cjs`, `preload.cjs`, `printManager.cjs`, package manifests, and `scripts/verify-desktop-package.cjs`.
- Desktop UI/actions: `desktop/renderer/main.js`, `desktop.css`, and `printing/` including four registered Intent factories, shared stage registry, and six separate stage files.
- Shared data fixes: `js/core/firestoreRead.js`, `authService.js`, `staffProfileRead.js`, `js/services/offlineStatusService.js`, `offlineReadinessService.js`, `sessionDataStore.js`, and `js/controllers/dashboardController.js`.
- Printing/UI: `js/services/nativeInvoicePrintService.js`, `bulkInvoicePrintService.js`, and `js/views/layoutView.js`, `settingsView.js`, `invoiceView.js`, `dashboardView.js`.
- Verification: `desktop/integration.cjs`, `desktop/renderer/integration.js`, `scripts/test-desktop-integration.cjs`, `scripts/run-desktop-integration.cjs`, `tests/desktop-printing.test.mjs`, and updated batch/dashboard/offline regression tests.
- Release metadata: root/desktop package versions, `index.html`, `js/config.js`, `scripts/build.cjs`, generated deployment metadata and service worker, and desktop documentation.

`SaveDesktopPrintSettingsIntent`, `ChooseDesktopPdfFolderIntent`, `PrintDesktopInvoicesIntent`, and `FileDesktopInvoicesIntent` all register and execute Validate → Normalize → AddContext → Authorize → Process → Emit. AddContext verifies the current staff session. Existing business and restart Intents remain intact. New JavaScript uses traditional named functions without arrows, optional chaining, nullish coalescing, or browser Crypto APIs.
