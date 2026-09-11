# Kyrgyz Organics - Order & Invoice Admin Tool

A premium, production-ready admin tool for managing orders and invoices, replacing spreadsheet workflows with a modern web interface.

## Tech Stack

- **Frontend**: Plain HTML, CSS (Variables, Flexbox/Grid), Vanilla JavaScript (ES Modules).
- **Backend**: Firebase (Firestore, Storage, Auth).
- **Hosting**: [GitHub Pages](https://bryantfriend.github.io/oako_invoices/), published from the root of `main`.
- **Architecture**: MVC (Model-View-Controller) with Service layer.

## Project Structure

```
/
  index.html          # Entry point
  /css                # Styles (Variables, Global, Animations)
  /js
    main.js           # App initialization
    router.js         # Client-side routing
    /core             # Core services (Auth, Store, Config)
    /services         # Data services (Order, Invoice)
    /views            # UI Rendering logic
    /controllers      # Business logic & Orchestration
    /components       # Reusable UI components
  /firebase           # Firebase configuration & rules
```

## Setup & Development

1.  **Prerequisites**:
    - Node.js (for Firebase CLI tools)
    - Firebase CLI (`npm install -g firebase-tools`)

2.  **Installation**:
    ```bash
    # Clone the repository
    git clone <repo-url>
    cd kyrgyz-organics-admin

    # Install the locked build and verification dependencies
    npm ci
    ```

3.  **Running Locally**:
    Since this uses ES Modules, you must use a local server.
    ```bash
    npx serve .
    # OR
    python -m http.server 8000
    ```

4.  **Firebase rules checks**:
    Install Java 21 or later and the Firebase CLI, then run the isolated Firestore/Storage integration suite:
    ```bash
    npm run test:rules
    ```
    This uses the `demo-invoice-rules` emulator project and the same Firebase SDK version as the browser app. The suite refuses to run without local emulator endpoints; it never changes production records.

## Deployment

The app is deployed through GitHub Pages; Firebase holds its data and security rules. Publish the rules before the application when adding a collection:

```bash
npm run check
npm run test:rules
firebase deploy --project oa-kyrgyz-organic --only firestore:rules,storage --non-interactive
git add <reviewed release files, including sw.js and deployment-version.json>
git commit -m "Release invoice improvements"
git push origin main
```

Wait for the GitHub Pages build to succeed, then verify the live `deployment-version.json` and refresh the application. Keep `js/config.js`, `index.html`, `deployment-version.json`, and the generated `sw.js` in the same release. Version numbers are managed by `scripts/build.cjs`.

Before replacing shared Firebase rules, compare them with the active production release and preserve any shared application paths. The repository's Storage rules include the existing campaign and store media paths for this reason. See [the productivity release notes](docs/invoice-productivity.md) and [rollout plan](docs/invoice-productivity-migration.md).
