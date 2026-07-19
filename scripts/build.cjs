const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
const { injectManifest } = require('workbox-build');

const root = process.cwd();
const vendorDir = path.join(root, 'vendor');
const tempDir = path.join(root, '.workbox');
const bundledWorker = path.join(tempDir, 'sw-bundled.js');
const deploymentVersion = {
    appVersion: '2.34',
    serviceWorkerVersion: '2.34',
    dexieSchemaVersion: 3
};

function ensureDirectory(directory) {
    fs.mkdirSync(directory, { recursive: true });
}

function copyFile(source, destination) {
    ensureDirectory(path.dirname(destination));
    fs.copyFileSync(source, destination);
}

async function buildBrowserVendorLibraries() {
    copyFile(
        path.join(root, 'node_modules/jspdf/dist/jspdf.umd.min.js'),
        path.join(vendorDir, 'jspdf.umd.min.js')
    );
    copyFile(
        path.join(root, 'node_modules/html2canvas/dist/html2canvas.min.js'),
        path.join(vendorDir, 'html2canvas.min.js')
    );

    await esbuild.build({
        entryPoints: [path.join(root, 'node_modules/qrcode/lib/browser.js')],
        bundle: true,
        outfile: path.join(vendorDir, 'qrcode.min.js'),
        format: 'iife',
        globalName: 'QRCode',
        platform: 'browser',
        target: ['chrome100', 'firefox100', 'safari15'],
        minify: true,
        sourcemap: false
    });
}
function replaceInFile(filePath, replacements) {
    let source = fs.readFileSync(filePath, 'utf8');
    for (const replacement of replacements) {
        source = source.replace(replacement.pattern, replacement.value);
    }
    fs.writeFileSync(filePath, source);
}

function updateRuntimeVersions() {
    replaceInFile(path.join(root, 'js/config.js'), [
        {
            pattern: /VERSION: '[^']+'/, 
            value: `VERSION: '${deploymentVersion.appVersion}'`
        },
        {
            pattern: /SERVICE_WORKER_VERSION: '[^']+'/, 
            value: `SERVICE_WORKER_VERSION: '${deploymentVersion.serviceWorkerVersion}'`
        }
    ]);
    replaceInFile(path.join(root, 'js/service-worker/source-sw.js'), [
        {
            pattern: /const OAKO_SERVICE_WORKER_VERSION = '[^']+';/,
            value: `const OAKO_SERVICE_WORKER_VERSION = '${deploymentVersion.serviceWorkerVersion}';`
        }
    ]);
    replaceInFile(path.join(root, 'index.html'), [
        {
            pattern: /src="\.\/js\/main\.js\?v=[^"]+"/,
            value: `src="./js/main.js?v=${deploymentVersion.appVersion}"`
        }
    ]);
}
async function buildServiceWorker() {
    ensureDirectory(tempDir);

    await esbuild.build({
        entryPoints: [path.join(root, 'js/service-worker/source-sw.js')],
        bundle: true,
        outfile: bundledWorker,
        format: 'iife',
        target: ['chrome100', 'firefox100', 'safari15'],
        minify: true,
        sourcemap: false
    });

    const result = await injectManifest({
        swSrc: bundledWorker,
        swDest: path.join(root, 'sw.js'),
        globDirectory: root,
        globPatterns: [
            'index.html',
            'offline.html',
            'manifest.json',
            'css/*.css',
            'js/**/*.js',
            'vendor/*.mjs',
            'Payment QR Code.png'
        ],
        globIgnores: [
            'node_modules/**/*',
            '.git/**/*',
            '.workbox/**/*',
            'firebase/**/*',
            'tests/**/*',
            'ko-server.*.txt'
        ],
        maximumFileSizeToCacheInBytes: 2 * 1024 * 1024
    });

    console.log('Generated sw.js with ' + result.count + ' precached files, ' + result.size + ' bytes.');
}

async function main() {
    ensureDirectory(vendorDir);
    updateRuntimeVersions();
    copyFile(path.join(root, 'node_modules/dexie/dist/dexie.mjs'), path.join(vendorDir, 'dexie.mjs'));
    copyFile(path.join(root, 'node_modules/workbox-window/build/workbox-window.prod.mjs'), path.join(vendorDir, 'workbox-window.prod.mjs'));
    await buildBrowserVendorLibraries();
    fs.writeFileSync(path.join(root, 'deployment-version.json'), JSON.stringify(deploymentVersion, null, 2) + '\n');
    await buildServiceWorker();
}

main().catch(function(error) {
    console.error(error);
    process.exit(1);
});
