const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const environment = Object.assign({}, process.env);
if (process.platform === 'win32') {
    // Some packaged Windows shells cannot connect Java's AF_UNIX selector sockets.
    // A deliberately unavailable socket directory makes PipeImpl use its TCP fallback.
    // This changes only this emulator process; it does not change the installed JDK.
    const unavailableDirectory = path.join(os.tmpdir(), 'ko-emulator-tcp-only', 'unavailable');
    if (fs.existsSync(unavailableDirectory)) {
        throw new Error('The emulator TCP fallback directory must not exist: ' + unavailableDirectory);
    }
    environment.JAVA_TOOL_OPTIONS = (environment.JAVA_TOOL_OPTIONS || '')
        + ' "-Djdk.net.unixdomain.tmpdir=' + unavailableDirectory + '"';
}

const result = spawnSync(
    'firebase emulators:exec --project demo-invoice-rules --config firebase.emulators.json --only firestore,storage "node --test tests/firebase-rules.integration.mjs"',
    { shell: true, stdio: 'inherit', env: environment }
);
if (result.error) throw result.error;
process.exitCode = result.status === null ? 1 : result.status;
