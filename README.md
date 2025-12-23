# Kyrgyz Organics - Order & Invoice Admin Tool

A premium, production-ready admin tool for managing orders and invoices, replacing spreadsheet workflows with a modern web interface.

## Tech Stack

- **Frontend**: Plain HTML, CSS (Variables, Flexbox/Grid), Vanilla JavaScript (ES Modules).
- **Backend**: Firebase (Firestore, Storage, Auth, Hosting).
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

    # Install dependencies (none for frontend, but useful for dev tools)
    npm install
    ```

3.  **Running Locally**:
    Since this uses ES Modules, you must use a local server.
    ```bash
    npx serve .
    # OR
    python -m http.server 8000
    ```

4.  **Firebase Emulators**:
    To run with local Firestore/Auth emulation:
    ```bash
    firebase emulators:start
    ```

## Deployment

```bash
firebase deploy
```
