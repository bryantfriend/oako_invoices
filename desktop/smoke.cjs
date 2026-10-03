const fs = require('fs');
const path = require('path');

async function runSmoke(app, window) {
    var timeout = setTimeout(function() { console.error('Desktop smoke timed out'); app.exit(1); }, 30000);
    // Block cloud traffic to prove the installed shell does not need a network.
    window.webContents.session.webRequest.onBeforeRequest({ urls: ['https://*/*', 'http://*/*'] }, function(details, callback) {
        callback({ cancel: true });
    });
    try {
        await new Promise(function(resolve) { window.webContents.once('did-finish-load', resolve); });
        var result = await window.webContents.executeJavaScript(`(async function() {
            var started = Date.now();
            while (!document.getElementById('login-form') && Date.now() - started < 15000) {
                await new Promise(function(resolve) { setTimeout(resolve, 100); });
            }
            while (document.querySelector('.oven-overlay') && Date.now() - started < 15000) {
                await new Promise(function(resolve) { setTimeout(resolve, 100); });
            }
            var state = await window.desktopApp.getUpdateState();
            await new Promise(function(resolve) { requestAnimationFrame(function() { requestAnimationFrame(resolve); }); });
            var popup = window.open('', '_blank', 'width=980,height=850');
            var popupWorks = Boolean(popup);
            if (popup) { popup.document.write('<title>Smoke print preview</title><p>Invoice preview</p>'); popup.document.close(); popup.close(); }
            var cacheWorks = await new Promise(function(resolve, reject) {
                var request = indexedDB.open('desktop-smoke', 1);
                request.onupgradeneeded = function() { request.result.createObjectStore('checks'); };
                request.onerror = function() { reject(request.error); };
                request.onsuccess = function() {
                    var database = request.result;
                    var transaction = database.transaction('checks', 'readwrite');
                    transaction.objectStore('checks').put('saved', 'sample');
                    transaction.oncomplete = function() { database.close(); resolve(true); };
                    transaction.onerror = function() { reject(transaction.error); };
                };
            });
            return { url: location.href, signedOutShell: Boolean(document.getElementById('login-form')), chart: typeof Chart, qr: typeof QRCode, pdf: typeof jspdf, desktopBridge: Boolean(window.desktopApp), updateStatus: state.status, nodeUnavailable: typeof require === 'undefined', indexedDb: cacheWorks, printPopup: popupWorks, elapsedAfterLoadMs: Date.now() - started };
        })()`);
        var screenshot = await window.webContents.capturePage();
        fs.mkdirSync(path.resolve(__dirname, '../output/playwright'), { recursive: true });
        fs.writeFileSync(path.resolve(__dirname, '../output/playwright/windows-desktop.png'), screenshot.toPNG());
        fs.writeFileSync(path.resolve(__dirname, '../output/windows-desktop-smoke.json'), JSON.stringify(result, null, 2));
        console.log(JSON.stringify(result));
        clearTimeout(timeout);
        app.exit(result.signedOutShell && result.nodeUnavailable && result.indexedDb && result.printPopup && result.chart !== 'undefined' ? 0 : 1);
    } catch (error) {
        clearTimeout(timeout);
        console.error(error);
        app.exit(1);
    }
}

module.exports = { runSmoke: runSmoke };
