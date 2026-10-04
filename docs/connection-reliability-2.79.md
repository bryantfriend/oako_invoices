# Connection reliability — 2.79

The reported diagnostics showed Browser Online, Health Reachable, and a Firestore
probe timing out after 2,200 ms. That probe failure did not establish that the
user's internet connection was down.

## Changes

- `js/core/firebase.js`: use the SDK's normal transport with automatic long-poll
  detection, rather than forcing long polling for every connection. Long polls
  use a 25-second transport timeout for compatibility with buffering proxies.
- `js/core/firestoreServerRead.js`: temporary, cancellable listeners wait for a
  server-confirmed snapshot, including valid empty collections. Cache snapshots
  do not masquerade as server responses. Success, error, and timeout unsubscribe.
- `js/core/firestoreRead.js`: start each deadline after a scheduler slot becomes
  available; cancel expired network reads and release the slot. Previously a
  timed-out SDK promise could retain a slot and block subsequent collections.
  Allow up to 25 seconds for data requests, while respecting shorter caller
  limits. Successful server reads inform connection diagnostics.
- `js/services/connectionStateService.js`: allow 15 seconds for the cloud probe,
  run website and cloud checks concurrently, deduplicate overlapping probes,
  recognize success immediately, and prevent an older failed probe from
  overwriting a successful business-data read. Explain authorization failures.
- `tests/connection-reliability.test.mjs`, `tests/desktop-printing.test.mjs`, and
  `tests/offline-workbox.test.mjs`: regression coverage and updated SDK boundaries.
- `js/services/customerService.js`, `js/views/customerView.js`: return customer
  rows without waiting for hidden PIN updates. Unset PINs display "Not set";
  explicit create/update actions still save PINs. Failed reads remain errors.
- `desktop/updateManager.cjs`, `desktop/main.cjs`, `desktop/renderer/main.js`:
  manual update checks show checking, current, progress, ready, or error feedback.
  The installer shortcut is named "Kyrgyz Organics Windows" to distinguish it
  from existing Chrome/PWA shortcuts. App identity and saved data stay unchanged.
- Release metadata: root and desktop package files, `scripts/build.cjs`,
  `js/config.js`, `index.html`, `deployment-version.json`, and service workers.

## Verification

All 320 automated tests pass; web assets and the service worker build successfully.
A fresh Windows renderer signed in against local Firebase emulators and loaded
customers, orders, invoices, and settings with initial connection mode Online.
Individual and two-up PDFs and subsequent Dexie cache loading also passed.

After installing 2.79.0 or refreshing the web app to 2.79, open Customers, Orders,
and Invoices. Details should record a recent successful Firestore read and Online
after cloud data arrives. Real connection and permission failures remain visible.

## Compatibility and architecture

No production records, Firestore rules, authentication credentials, database
schema, or pending offline actions are changed. These changes repair read
transport, scheduling, and diagnostic observations; they introduce no new business
mutation Intent. Existing actions retain all six ICF stages. New JavaScript uses
traditional functions without arrows, optional chaining, nullish coalescing, or
the Crypto API.

Local tests do not prove connectivity from the user's installed application to
production Firebase. A persistent error after updating needs fresh Details from
that installation. The installer remains unsigned, as in the previous release.

SDK transport settings follow Firebase's documentation:
https://firebase.google.com/docs/reference/js/firestore.firestoresettings
https://firebase.google.com/docs/reference/js/firestore.experimentallongpollingoptions
