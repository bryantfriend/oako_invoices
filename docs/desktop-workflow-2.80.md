# Windows workflow update 2.80

## What changed

- Orders now has a Windows-only **Print delivery run** action for selected orders. It prepares invoices, packing lists without prices, and customer delivery labels, then sends them to the configured Windows printers. All selected invoices and printers must pass preparation before the first document is sent. A retry sends only document types whose previous submission failed.
- **Save a PDF automatically when printing** is off by default. Settings can enable it and choose a local folder. Manual Save PDF remains available. Existing explicit opt-in settings are preserved. This preference controls local PDF copies; invoices still remain in the business database.
- Closing the main window keeps the app in the Windows tray, where its existing authenticated sync queue continues working. Startup in the tray, background operation, and the shortcut can each be disabled in Settings. Windows startup is configured after verified staff sign-in. Exit in the tray menu stops the application.
- Orders, invoices, customers, and products warm their existing cache after staff sign-in, so reopening the window can use local data. This does not repeatedly download the full history or bypass existing retry, ownership, and authorization rules.
- **Ctrl+Alt+O** opens a separate order-entry window. Saving an order closes that window and refreshes the main window's cached orders. The quick window has its own draft storage so it does not overwrite a draft in the main editor. If another application owns the shortcut, the tray's New order action is available.

## Using it

1. Install/update to Windows app 2.80, sign in, and open Settings → Windows printing and PDF filing.
2. Select the invoice printer and, optionally, separate packing-list and label printers. Set label dimensions to match the loaded stock. Automatic PDF saving starts unchecked on a fresh profile; leave it unchecked unless local copies are wanted.
3. Select orders and choose Print delivery run. Check the print window for failures and confirm printed invoices only after checking the actual paper. Test with one order before a large delivery run.
4. Close the main window and reopen it through the tray. Use Ctrl+Alt+O from another application, save an order, and confirm the main Orders view contains it. Use tray Exit to stop background work.

## Validation and limits

- The complete Node suite passes, including verified-staff authorization, six-stage intent registration, disabled automatic PDF filing, delivery preflight, printer failure/retry without duplicate successful submissions, label dimensions, escaped document content, and draft isolation.
- A real Electron integration test uses local Firebase emulators and simulated printer callbacks. It checks sign-in, customer/order/invoice views, real PDF generation, three delivery document submissions, a separately rendered quick-order form, and close-to-background behavior. No production records or physical printers are used by this test.
- Production packaging verifies local dependencies, current source in the ASAR archive, installer checksum/update metadata, and absence of emulator code.
- Physical printing, global shortcut registration with other installed apps, and login startup must be checked on the installed computer. Windows spool acceptance does not prove paper came out; the existing physical-print confirmation remains required. The installer remains unsigned.
- Existing opted-in PDF filing is preserved. No Firebase rules, schema, or production records are migrated. A background app still needs valid authentication and reachable cloud services to sync; keeping it open cannot resolve a cloud permission error.

## Architecture and changed files

New `PrintDesktopDeliveryRunIntent` and `SaveDesktopWorkflowSettingsIntent` each use all six ICF stages: Validate, Normalize, AddContext, Authorize, Process, Emit. Their stages are registered through the existing desktop action family. Verified staff identity is checked before processing. Order creation, invoice preparation, cache reads and paper confirmation continue through their existing flows. New authored JavaScript uses traditional functions and avoids arrow functions, optional chaining, nullish coalescing and Crypto API calls.

Changed/new files:

- Native lifecycle and preferences: `desktop/main.cjs`, `desktop/preload.cjs`, `desktop/workflowManager.cjs`, `desktop/printManager.cjs`.
- Desktop UI and intents: `desktop/renderer/main.js`, `desktop/renderer/workflow.js`, `desktop/renderer/desktop.css`, `desktop/renderer/printing/actions.js`, `desktop/renderer/printing/settingsElement.js`, `desktop/renderer/printing/PrintDesktopDeliveryRunIntent.js`, `desktop/renderer/printing/SaveDesktopWorkflowSettingsIntent.js`, and `desktop/renderer/printing/stages/{validateDesktopAction,processDesktopAction}.js`.
- Shared document/order workflow: `js/services/deliveryPrintDocuments.js`, `js/services/nativeInvoicePrintService.js`, `js/services/bulkInvoicePrintService.js`, `js/services/workflowLocalStore.js`, `js/views/dashboardView.js`.
- Tests and packaging: `tests/desktop-workflow.test.mjs`, `desktop/integration.cjs`, `scripts/verify-desktop-package.cjs`, root and desktop `package.json`/`package-lock.json`, `scripts/build.cjs`.
- Generated version/cache metadata: `deployment-version.json`, `js/config.js`, `index.html`, `js/service-worker/source-sw.js`, `sw.js`.
- This release note: `docs/desktop-workflow-2.80.md`.
