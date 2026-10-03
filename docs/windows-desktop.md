# Kyrgyz Organics for Windows

The current Windows desktop release build is version **2.78.0**, based on web application 2.78. It uses Electron with a per-user NSIS installer. The installer adds desktop and Start menu shortcuts, a Windows taskbar identity, a dedicated window, and standard Windows menus. See [2.78 changes and verification](windows-desktop-2.78.md).

## Local app and speed

The application HTML, CSS, Firebase SDK, charts, QR renderer, and PDF/print libraries ship in the installer. Startup does not need to download application files, SDK modules, or fonts from a CDN. Segoe UI is used as the desktop font. The existing business logic and Firebase data remain shared with the website.

This reduces startup network dependencies; it does not make Firebase queries or cloud synchronization inherently faster. No comparative performance benchmark has been run. The hidden desktop smoke test opened the signed-out app with HTTP/HTTPS traffic blocked, confirmed IndexedDB writes, and opened a print-preview child window.

Desktop data lives in its own persistent Electron profile, separate from browser/PWA storage. **Sync pending browser work before switching to the desktop app.** Sign in online to populate the desktop cache, and review its offline data before disconnecting. Installing or updating preserves the application profile. Uninstalling does not intentionally delete that profile.

Invoice QR URLs, approval links, and the connectivity health check continue to use the public website. The build makes these desktop-only substitutions without changing web behavior. Service-worker updates are disabled in the desktop bundle; the installer updater owns desktop application versions.

## Automatic updates

The installed app checks GitHub Releases at startup and once per hour. Released updates download automatically in the background. A ready update displays **Restart to update**; it does not force a restart or install during ordinary exit.

On Restart to update, the user confirms that open edits and print jobs have finished. `RestartDesktopUpdateIntent` runs all six ICF stages: Validate, Normalize, AddContext, Authorize, Process, Emit. It checks the native updater state, checks the durable queue, synchronizes saved pending changes, and checks the queue again before allowing the restart. Remaining conflicts, failed/pending entries, a signed-out session with pending work, or storage failures block the restart. User confirmation is needed because unsaved form edits are not part of the durable queue.

The update source is the existing public repository `bryantfriend/oako_invoices`. No GitHub token or publishing credentials are included in the installer. Update download errors leave the current app available; later checks can retry. The manual check is under Help → Check for updates.

Automatic updating uses the installer, blockmap, and `latest.yml` assets on public GitHub Releases. Version 2.77.0 was published previously. Each higher version must publish all three matching files before the update feed is exposed.

## Build and run

From the repository root, install its locked dependencies with `npm ci`. Then install desktop dependencies from the desktop directory:

```powershell
Set-Location desktop
npm ci
Set-Location ..
npm run desktop:start
```

Create the Windows x64 installer:

```powershell
npm run desktop:dist
```

This builds locally and uses `--publish never`. The installer, blockmap, and `latest.yml` are generated in `output/windows/`. Generated bundles, runtime dependencies, and installers are ignored by Git. The desktop runtime is pinned and downloaded if missing during packaging.

Run `node scripts/verify-desktop-package.cjs` after packaging to verify the shipped source, excluded build tools, local scripts, and installer checksum against its update metadata.

## Release procedure

1. Increase `desktop/package.json` to a higher semantic version and update its lockfile. Keep the bundled web version aligned with the intended release.
2. Run `npm run check`, build the installer, and validate sign-in, a real invoice, printing, offline work, and subsequent synchronization using an authorized test account.
3. Configure Windows code signing through electron-builder's supported signing environment before general distribution. Never add signing keys or passwords to source control. The locally generated installer is **unsigned**, so Windows may warn about an unknown publisher.
4. Publish the matching `.exe`, `.exe.blockmap`, and `latest.yml` on a non-prerelease GitHub Release. Upload all three together. Use the installer filename specified by `latest.yml`; the configured artifact name has no spaces.
5. Install the prior version on a test PC and confirm the new version downloads, waits for a restart, installs, relaunches, and retains its cached data and account session.

The first installer and update feed were published as v2.77.0. Version 2.78 adds an authenticated local-emulator test for desktop data loading and native PDF output. No production transaction, physical printer job, actual installed upgrade, or signing certificate was exercised. Local tests cannot establish those results.

## Validation

- 304 project tests passed and the web build succeeded.
- Windows installer generation succeeded using Electron 44.5.1, electron-builder 26.15.3, and electron-updater 6.8.9.
- Real Electron smoke test: offline signed-out startup, bundled Chart/QR/PDF libraries, narrow IPC bridge, no renderer Node access, IndexedDB writes, and blank-window print preview passed. It uses an isolated `.workbox/desktop-smoke-profile` and writes no production records.
- Tests exercise update auto-download settings, readiness gating, navigation/file boundaries, all six restart stages, sync-before-restart, and blocked restarts for unconfirmed edits, signed-out pending work, remaining conflicts, storage failure, and native updater refusal.
- npm reported a high-severity advisory in the development-only installer tooling's HTTP cache dependency chain, with no patched version available when checked. These packages are excluded from the shipped application; retain this limitation when maintaining the build tools.

## Changed files and architecture

- `desktop/package.json`, `desktop/package-lock.json`: pinned runtime/build dependencies, installer metadata and update source.
- `desktop/build.cjs`: local bundle, desktop-only public URL and connectivity substitutions, local chart library, Windows icon.
- `desktop/main.cjs`, `desktop/preload.cjs`, `desktop/windowPolicy.cjs`: Windows lifecycle, local protocol, printing windows, restricted native bridge and file/navigation boundaries.
- `desktop/updateManager.cjs`: automatic download and explicit restart lifecycle.
- `desktop/renderer/main.js`, `desktop/renderer/desktop.css`: desktop updater UI and Intent execution.
- `desktop/renderer/update/RestartDesktopUpdateIntent.js`, `desktop/renderer/update/stages.js`, and the six files in `desktop/renderer/update/stages/`: complete registered ICF restart action, with each stage in its own file.
- `desktop/smoke.cjs`, `tests/desktop-app.test.mjs`, `scripts/verify-desktop-package.cjs`: runtime, behavioral, and shipped-package checks.
- Root `package.json` and `.gitignore`: desktop commands and generated-file exclusions. `js/views/settingsView.js` marks the browser installation section so the installed desktop build can hide it.
- `scripts/create-app-icons.ps1`, `assets/icons/app-256.png`, and generated `sw.js`: an additional 256px icon for the Windows ICO and the updated web precache.

New application JavaScript uses named functions and clear stage boundaries without arrows, optional chaining, nullish coalescing, or new browser Crypto API usage. The package verifier uses Node's hashing library to check installer integrity. Existing business Intents and their stages are preserved. The native main process rechecks window/frame identity before allowing any updater action.
