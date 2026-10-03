const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { dialog } = require('electron');

async function runIntegration(app, window) {
    var timeout = setTimeout(function timedOut() { console.error('Desktop integration timed out'); app.exit(1); }, 60000);
    var directory = path.resolve(__dirname, '../.workbox/desktop-integration/pdfs');
    var loaded = new Promise(function documentLoaded(resolve) { window.webContents.once('did-finish-load', resolve); });
    // The development-only test selects a disposable directory instead of opening a native dialog.
    dialog.showOpenDialog = async function chooseTestFolder() { return { canceled: false, filePaths: [directory] }; };
    window.webContents.on('console-message', function rendererMessage(event) { console.log('[renderer] ' + event.message); });
    window.webContents.debugger.attach('1.3');
    await window.webContents.debugger.sendCommand('Network.enable');
    window.webContents.debugger.on('message', function networkDiagnostic(event, method, parameters) {
        if (method === 'Network.loadingFailed') console.log('[test-network-failure] ' + JSON.stringify({ error: parameters.errorText, cors: parameters.corsErrorStatus, blocked: parameters.blockedReason }));
    });
    window.webContents.session.webRequest.onBeforeRequest({ urls: ['https://*/*', 'http://*/*'] }, function localOnly(details, callback) {
        var canceled = new URL(details.url).hostname !== '127.0.0.1';
        if (canceled) console.log('[test-network] Blocked external host ' + new URL(details.url).hostname);
        else console.log('[test-network] Local request ' + new URL(details.url).pathname);
        callback({ cancel: canceled });
    });
    window.webContents.session.webRequest.onErrorOccurred({ urls: ['http://127.0.0.1/*'] }, function requestFailed(details) { console.log('[test-network] ' + details.error + ' ' + new URL(details.url).pathname); });
    try {
        await loaded;
        var result = await window.webContents.executeJavaScript(`(async function integrationCheck() {
            async function waitFor(check) {
                var start = Date.now();
                while (!check()) {
                    if (Date.now() - start > 15000) throw new Error('Timed out waiting for a desktop view: ' + location.hash);
                    await new Promise(function delay(resolve) { setTimeout(resolve, 50); });
                }
            }
            await waitFor(function loginReady() { return document.getElementById('login-form') && window.desktopIntegration; });
            var api = window.desktopIntegration;
            var signedIn = await api.auth.login('desktop-test@example.test', 'emulator-test-only');
            if (!signedIn.success) throw new Error('Test sign-in failed: ' + signedIn.error);
            await waitFor(function verified() { return api.auth.getAuthDebugState().isAdmin; });
            var initialConnection = api.connection.getSnapshot();
            var customers = await api.customers.getAllCustomers();
            var orders = await api.session.loadOrders({ source: 'desktop-integration' });
            var invoices = await api.session.loadInvoices({ source: 'desktop-integration' });
            async function visit(route, text) {
                location.hash = route;
                await api.router.handleLocationChange();
                await waitFor(function rendered() { return document.getElementById('page-container').innerText.indexOf(text) !== -1; });
                return true;
            }
            var customerView = await visit('#/customers', 'Desktop Test Customer');
            var orderView = await visit('#/', 'Desktop Test Customer');
            var invoiceView = await visit('#/invoices', 'DESKTOP-TEST-1');
            await visit('#/settings', 'Windows printing and PDF filing');
            await waitFor(function settingsReady() { return document.querySelector('desktop-print-settings form'); });
            await window.runDesktopPrintAction('chooseFolder', {});
            await window.runDesktopPrintAction('saveSettings', { deviceName: '', directPrint: false, copies: 1, paperSize: 'A4', autoFile: true });
            var preview = api.reservePrint();
            var prepared = await api.showPrint(preview, invoices.records, { companyName: 'Test Bakery' }, { autoPrint: false });
            var pdf = await window.runDesktopPrintAction('file', { windowName: preview.name, label: 'Desktop Test Customer-DESKTOP-TEST-1' });
            var confirmedBeforePrinting = !invoices.records[0].isPrinted && preview.document.getElementById('job-confirm').disabled;
            preview.close();
            var batchPreview = api.reservePrint();
            var batch = await api.bulkPrint.generateCombinedPdf(['test-order'], 'two-up-portrait', { settings: { companyName: 'Test Bakery' } }, { previewWindow: batchPreview });
            var batchPdf = await window.runDesktopPrintAction('file', { windowName: batchPreview.name, label: 'native-two-up-batch' });
            var twoCopies = batchPreview.document.querySelectorAll('.print-slot').length === 2;
            batchPreview.close();
            var readiness = await api.readiness.getStatus();
            await new Promise(function settle(resolve) { setTimeout(resolve, 200); });
            api.session.clearUserScopedMemory('integration-reopen');
            var start = performance.now();
            var cached = await api.session.loadOrders({ source: 'desktop-integration-cache' });
            return { customers: customers.length, orders: orders.records.length, invoices: invoices.records.length, initialConnectionMode: initialConnection.mode, customerView: customerView, orderView: orderView, invoiceView: invoiceView, settingsView: Boolean(document.querySelector('desktop-print-settings form')), pdfPath: pdf.filedPath, printPages: prepared.pageCount, paperUnconfirmed: confirmedBeforePrinting, nativeBatch: batch.nativePrint === true && twoCopies, batchPdfPath: batchPdf.filedPath, installedFilesReady: readiness.serviceWorker.installed === true && readiness.serviceWorker.ready, cachedSource: cached.meta.source, cacheLoadMs: performance.now() - start };
        })()`);
        assert.equal(result.customers, 1);
        assert.equal(result.orders, 1);
        assert.equal(result.invoices, 1);
        assert.equal(result.cachedSource, 'dexie');
        assert.equal(result.installedFilesReady, true);
        assert.equal(result.paperUnconfirmed, true);
        assert.equal(result.nativeBatch, true);
        var pdf = await fs.readFile(result.pdfPath);
        assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
        assert.ok(pdf.length > 1000);
        var output = path.resolve(__dirname, '../output');
        await fs.mkdir(path.join(output, 'playwright'), { recursive: true });
        await fs.writeFile(path.join(output, 'windows-desktop-integration.json'), JSON.stringify(result, null, 2));
        await fs.writeFile(path.join(output, 'playwright/windows-desktop-settings.png'), (await window.webContents.capturePage()).toPNG());
        console.log(JSON.stringify(result));
        clearTimeout(timeout);
        app.exit(0);
    } catch (error) {
        clearTimeout(timeout);
        console.error(error);
        console.error(await window.webContents.executeJavaScript("document.getElementById('page-container').innerText.slice(0, 4000)"));
        app.exit(1);
    }
}

module.exports = { runIntegration: runIntegration };
