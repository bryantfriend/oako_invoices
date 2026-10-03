const fs = require('fs');
const path = require('path');
const esbuild = require('../node_modules/esbuild');
const root = path.resolve(__dirname, '..');
const integration = process.argv.indexOf('--integration') !== -1;
const destination = integration ? path.join(root, '.workbox/desktop-integration/app') : path.join(__dirname, 'app');
const publicUrl = 'https://bryantfriend.github.io/oako_invoices/index.html';

function copyDirectory(name) {
    fs.cpSync(path.join(root, name), path.join(destination, name), { recursive: true });
}

function createWindowsIcon() {
    const png = fs.readFileSync(path.join(destination, 'assets/icons/app-256.png'));
    const header = Buffer.alloc(22);
    header.writeUInt16LE(1, 2);
    header.writeUInt16LE(1, 4);
    header.writeUInt16LE(1, 10);
    header.writeUInt16LE(32, 12);
    header.writeUInt32LE(png.length, 14);
    header.writeUInt32LE(22, 18);
    fs.writeFileSync(path.join(destination, 'assets/icons/app.ico'), Buffer.concat([header, png]));
}

async function buildDesktop() {
    fs.mkdirSync(destination, { recursive: true });
    copyDirectory('css');
    copyDirectory('assets');
    copyDirectory('vendor');
    fs.copyFileSync(path.join(root, 'Payment QR Code.png'), path.join(destination, 'Payment QR Code.png'));
    createWindowsIcon();
    var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    html = html.replace(/\s*<link[^>]+(?:fonts\.googleapis|fonts\.gstatic)[^>]*>/g, '');
    html = html.replace(/\s*<link rel="manifest"[^>]*>/, '');
    html = html.replace(/\s*<script[^>]+src="\.\/js\/components\/(?:ovenLoading|appInstallControl)\.js"[^>]*><\/script>/g, '');
    html = html.replace('https://cdn.jsdelivr.net/npm/chart.js', './vendor/chart.umd.js');
    html = html.replace(/\.\/js\/main\.js\?v=[^"]+/, './renderer.js');
    html = html.replace('</head>', '<link rel="stylesheet" href="./desktop.css"></head>');
    fs.writeFileSync(path.join(destination, 'index.html'), html);
    fs.copyFileSync(path.join(__dirname, 'node_modules/chart.js/dist/chart.umd.js'), path.join(destination, 'vendor/chart.umd.js'));
    fs.copyFileSync(path.join(__dirname, 'renderer/desktop.css'), path.join(destination, 'desktop.css'));
    var built = await esbuild.build({
        entryPoints: [path.join(__dirname, integration ? 'renderer/integration.js' : 'renderer/main.js')],
        outfile: path.join(destination, 'renderer.js'),
        bundle: true,
        format: 'esm',
        target: 'chrome140',
        minify: true,
        metafile: true,
        plugins: [{
            name: 'local-desktop-dependencies',
            setup: function(api) {
                if (integration) {
                    api.onLoad({ filter: /[\\/]js[\\/]core[\\/]firebase\.js$/ }, function loadEmulatorFirebase(args) {
                        var source = fs.readFileSync(args.path, 'utf8');
                        source = source.replace('initializeApp(firebaseConfig)', "initializeApp({ apiKey: 'demo-api-key', authDomain: 'demo-desktop-invoices.firebaseapp.com', projectId: 'demo-desktop-invoices', storageBucket: 'demo-desktop-invoices.appspot.com' })");
                        source += "\nimport { connectAuthEmulator } from 'firebase/auth';\nimport { connectFirestoreEmulator } from 'firebase/firestore';\nconnectAuthEmulator(auth, 'http://127.0.0.1:9096', { disableWarnings: true });\nconnectFirestoreEmulator(db, '127.0.0.1', 8086);\n";
                        return { contents: source, loader: 'js' };
                    });
                }
                api.onResolve({ filter: /^https:\/\/www\.gstatic\.com\/firebasejs\/10\.7\.1\/firebase-.*\.js$/ }, async function resolveFirebaseBrowserImport(args) {
                    var moduleName = /firebase-([\w-]+)\.js$/.exec(args.path)[1];
                    // Resolve browser ESM exports consistently instead of Node's CommonJS entries.
                    return api.resolve('firebase/' + moduleName, { resolveDir: root, kind: 'import-statement' });
                });
                api.onLoad({ filter: /[\\/]js[\\/]config\.js$/ }, function(args) {
                    var source = fs.readFileSync(args.path, 'utf8');
                    source = source.replace('WORKBOX_CACHING_ENABLED: true', 'WORKBOX_CACHING_ENABLED: false');
                    return { contents: source, loader: 'js' };
                });
                api.onLoad({ filter: /[\\/]js[\\/]services[\\/]connectionStateService\.js$/ }, function(args) {
                    var source = fs.readFileSync(args.path, 'utf8');
                    source = source.replace("new URL('health.json', window.location.href)", "new URL('health.json', '" + publicUrl + "')");
                    return { contents: source, loader: 'js' };
                });
                api.onLoad({ filter: /[\\/]js[\\/]services[\\/]qrService\.js$/ }, function(args) {
                    var source = fs.readFileSync(args.path, 'utf8');
                    source = source.replace('${window.location.origin}${window.location.pathname}', publicUrl);
                    return { contents: source, loader: 'js' };
                });
                api.onLoad({ filter: /[\\/]js[\\/]services[\\/]invoiceApprovalService\.js$/ }, function(args) {
                    var source = fs.readFileSync(args.path, 'utf8');
                    source = source.replace("new URL('order-review.html', window.location.href)", "new URL('order-review.html', '" + publicUrl + "')");
                    return { contents: source, loader: 'js' };
                });
            }
        }]
    });
    fs.mkdirSync(path.join(root, '.workbox'), { recursive: true });
    fs.writeFileSync(path.join(root, '.workbox', integration ? 'desktop-integration-meta.json' : 'desktop-bundle-meta.json'), JSON.stringify(built.metafile, null, 2));
    console.log('Built local Windows renderer with bundled Firebase, charts, and print libraries.');
}

buildDesktop().catch(function(error) { console.error(error); process.exitCode = 1; });
