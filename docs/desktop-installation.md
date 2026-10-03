# Installable app — release 2.77

Kyrgyz Organics can be installed from a supported browser and opened in its own window with the same account and shared Firebase data. There is no separate desktop installer.

## Where to install

Choose **Install app** on the sign-in page, in the desktop header, or in Settings. If the browser exposes its installation prompt, the dialog provides an Install app button. Otherwise, it shows browser-menu instructions. On narrow screens the header shortcut is hidden to preserve space; the sign-in and Settings controls remain available.

Chrome/Edge installation availability depends on browser policy, platform, and browsing mode. Safari users can use Add to Dock when available; iPhone/iPad users can use Share → Add to Home Screen. A browser may offer manual installation even when no programmatic prompt is available.

## Offline use and updates

Sign in online first, then check Offline readiness using the sync status control. Installation does not download every company record. Existing cached datasets and the existing pending-change queue continue to determine offline capability. Reconnect to synchronize pending changes. Avoid clearing browser/site storage while work is pending.

The existing update banner remains in use. Save active form edits before Update now. The update flow checks pending synchronization before refreshing; installation does not alter that behavior.

## Changes

- `manifest.json`: explicit identity and relative scope, local 192/512 PNG icons with maskable safe areas. Identity resolves to the existing start URL to retain the previous implicit app identity.
- `assets/icons/`: invoice-and-leaf icons, including an Apple touch icon, generated with `scripts/create-app-icons.ps1`.
- `index.html`, `css/app-install.css`: local favicon, touch icon, theme color, early installation event capture, responsive native dialog.
- `js/services/appInstallService.js`, `js/components/appInstallControl.js`: prompt lifecycle, installed-state detection, guidance, accessible status, dismissal/error handling.
- `js/views/layoutView.js`, `js/views/loginView.js`, `js/views/settingsView.js`: installation entry points.
- `scripts/build.cjs`, `js/config.js`, `js/service-worker/source-sw.js`, `deployment-version.json`, `sw.js`: release 2.77 and icon precaching.
- `tests/app-install.test.mjs`: prompt consumption, cancellation, acceptance versus confirmed installation, standalone/iOS state, errors, concurrent clicks, and unsubscribe behavior.

Installation is browser-owned UI and does not mutate business data. No business Intent was added or modified; existing ICF stages are preserved. New JavaScript uses named functions and follows the project style rules.

## Validation and manual acceptance

`npm run check`: 298 tests passed and the production build succeeded. Browser checks covered the real sign-in installation dialog at desktop and 390px widths, Escape dismissal, service-worker control, an offline reload, and successful offline retrieval of the manifest and all three PNG icons. Browser-menu guidance appeared when the automation browser did not expose a native install prompt.

After publishing, verify actual OS installation in Chrome or Edge: launch the app from Start/Dock, confirm standalone display, sign in, check Offline readiness, disconnect and use cached data, reconnect and sync. Validate the next release's update banner with saved work. Actual OS installation, authenticated offline transactions, and live update activation were not exercised in this local browser session.

Publish the application and generated worker together through the existing GitHub Pages release process. This change requires no Firebase rule or schema migration.
