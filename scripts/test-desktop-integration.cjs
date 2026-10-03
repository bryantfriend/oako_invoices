const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const directory = path.join(root, '.workbox/desktop-integration');
fs.mkdirSync(directory, { recursive: true });
const config = path.join(directory, 'firebase.json');
const rules = path.join(directory, 'firestore.rules');
fs.writeFileSync(rules, "rules_version = '2'; service cloud.firestore { match /databases/{database}/documents { match /{document=**} { allow read, write: if request.auth != null; } } }");
fs.writeFileSync(config, JSON.stringify({ firestore: { rules: rules }, emulators: { auth: { host: '127.0.0.1', port: 9096 }, firestore: { host: '127.0.0.1', port: 8086 }, ui: { enabled: false }, singleProjectMode: true } }));
const environment = Object.assign({}, process.env);
const unavailable = path.join(os.tmpdir(), 'ko-emulator-tcp-only', 'unavailable');
if (fs.existsSync(unavailable)) throw new Error('Emulator fallback directory must not exist.');
environment.JAVA_TOOL_OPTIONS = (environment.JAVA_TOOL_OPTIONS || '') + ' "-Djdk.net.unixdomain.tmpdir=' + unavailable + '"';
function run(command) {
    const result = spawnSync(command, { cwd: root, env: environment, shell: true, stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status || 1);
}
run('node desktop/build.cjs --integration');
run('firebase emulators:exec --project demo-desktop-invoices --config "' + config + '" --only auth,firestore "node scripts/run-desktop-integration.cjs"');
