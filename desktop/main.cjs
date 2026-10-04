const { app, BrowserWindow, protocol, net, ipcMain, shell, Menu, dialog, Tray, globalShortcut } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const { autoUpdater } = require('electron-updater');
const { createUpdateManager } = require('./updateManager.cjs');
const policy = require('./windowPolicy.cjs');
const { createPrintManager } = require('./printManager.cjs');
const { createWorkflowManager } = require('./workflowManager.cjs');
var workflowManager;
var workflowSettings = { background: true, shortcut: true };
var tray;
var quickWindow;
var quitting = false;
var shortcutAvailable = false;

function showMainWindow() {
    if (!mainWindow) return;
    mainWindow.show();
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
}

function openQuickOrder() {
    if (quickWindow && !quickWindow.isDestroyed()) { quickWindow.show(); quickWindow.focus(); return; }
    quickWindow = new BrowserWindow({ title: 'New order — Kyrgyz Organics', width: 1000, height: 850, minWidth: 900, show: !smokeMode,
        webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false, offscreen: smokeMode } });
    quickWindow.loadURL('korganics://app/index.html?quick-order=1#/orders/create');
    quickWindow.webContents.on('did-create-window', function registerQuickPrint(window, details) { printManager.registerWindow(window, details); });
    quickWindow.on('closed', function() { quickWindow = null; });
}

function applyWorkflowSettings(settings) {
    workflowSettings = settings;
    if (smokeMode) return;
    if (app.isPackaged && settings.initialized) app.setLoginItemSettings({ openAtLogin: settings.startAtLogin === true, path: app.getPath('exe'), args: ['--background'] });
    globalShortcut.unregister('Control+Alt+O');
    shortcutAvailable = settings.shortcut === true && globalShortcut.register('Control+Alt+O', openQuickOrder);
    if (!tray) {
        tray = new Tray(path.join(__dirname, 'app/assets/icons/app-256.png'));
        tray.setToolTip('Kyrgyz Organics — background sync');
        tray.on('double-click', showMainWindow);
        tray.setContextMenu(Menu.buildFromTemplate([
            { label: 'Open Kyrgyz Organics', click: showMainWindow },
            { label: 'New order (Ctrl+Alt+O)', click: openQuickOrder },
            { type: 'separator' }, { label: 'Exit', click: function() { app.quit(); } }
        ]));
    }
}
var mainWindow;
var updates;
var updateTimer;
var printManager;
var integrationMode = !app.isPackaged && process.argv.indexOf('--desktop-integration') !== -1;
var smokeMode = !app.isPackaged && (process.argv.indexOf('--desktop-smoke') !== -1 || integrationMode);
if (smokeMode) app.setPath('userData', path.resolve(__dirname, integrationMode ? '../.workbox/desktop-integration/profile' : '../.workbox/desktop-smoke-profile'));

protocol.registerSchemesAsPrivileged([{ scheme: 'korganics', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
app.setAppUserModelId('kg.kyrgyzorganics.invoices');

function protectWindow(window) {
    window.webContents.on('will-navigate', function(event, url) {
        if (policy.isAppUrl(url) || policy.isPrintBlobUrl(url) || url === 'about:blank') return;
        event.preventDefault();
        if (policy.isExternalUrl(url)) shell.openExternal(url);
    });
    window.webContents.setWindowOpenHandler(function(details) {
        // Existing invoice printing writes into same-origin blank child windows.
        if (details.url === 'about:blank') {
            return { action: 'allow', overrideBrowserWindowOptions: { show: !smokeMode, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, offscreen: smokeMode } } };
        }
        if (policy.isExternalUrl(details.url)) shell.openExternal(details.url);
        return { action: 'deny' };
    });
    window.webContents.on('will-attach-webview', function(event) { event.preventDefault(); });
}

function authorizeBridge(event) {
    var owner = [mainWindow, quickWindow].find(function(window) { return window && !window.isDestroyed() && event.sender === window.webContents; });
    if (!owner || !event.senderFrame || event.senderFrame !== owner.webContents.mainFrame || !policy.isAppUrl(event.senderFrame.url)) {
        throw new Error('Desktop action is unavailable in this window.');
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        title: 'Kyrgyz Organics', width: 1360, height: 900, minWidth: 900, minHeight: 650,
        backgroundColor: '#ffffff', show: false, icon: path.join(__dirname, 'app/assets/icons/app-512.png'),
        webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, offscreen: smokeMode, backgroundThrottling: false }
    });
    mainWindow.once('ready-to-show', function() { if (!smokeMode && process.argv.indexOf('--background') === -1) mainWindow.show(); });
    mainWindow.on('close', function(event) {
        if (!quitting && (!smokeMode || integrationMode) && workflowSettings.background) { event.preventDefault(); mainWindow.hide(); }
    });
    mainWindow.on('session-end', function() { quitting = true; });
    mainWindow.webContents.on('did-create-window', function registerPrintWindow(window, details) { printManager.registerWindow(window, details); });
    mainWindow.webContents.on('did-fail-load', function(event, code, description, url, isMainFrame) {
        if (isMainFrame) dialog.showErrorBox('Kyrgyz Organics could not open', description);
    });
    mainWindow.loadURL('korganics://app/index.html');
    mainWindow.on('closed', function() { mainWindow = null; });
}

if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    app.on('second-instance', function() {
        showMainWindow();
    });
    app.on('browser-window-created', function(event, window) {
        if (window !== mainWindow) protectWindow(window);
    });
    app.whenReady().then(function() {
        var appRoot = integrationMode ? path.resolve(__dirname, '../.workbox/desktop-integration/app') : path.join(__dirname, 'app');
        protocol.handle('korganics', function(request) {
            var file = policy.resolveAppPath(appRoot, request.url);
            if (!file) return new Response('Not found', { status: 404 });
            return net.fetch(pathToFileURL(file).toString());
        });
        updates = createUpdateManager(autoUpdater, function(state) {
            if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('desktop:update-state', state);
        });
        ipcMain.handle('desktop:update-state', function(event) { authorizeBridge(event); return updates.getState(); });
        ipcMain.handle('desktop:check-update', async function(event) {
            authorizeBridge(event);
            if (app.isPackaged) await updates.check({ manual: true });
            return updates.getState();
        });
        ipcMain.handle('desktop:install-update', function(event) { authorizeBridge(event); return updates.install(); });
        printManager = createPrintManager({
            userData: app.getPath('userData'),
            getPrinters: function getPrinters() { return mainWindow.webContents.getPrintersAsync(); },
            chooseFolder: function chooseFolder() { return dialog.showOpenDialog(mainWindow, { title: 'Choose invoice PDF folder', properties: ['openDirectory', 'createDirectory'] }); }
        });
        ipcMain.handle('desktop:print-settings', function getPrintSettings(event) { authorizeBridge(event); return printManager.getSettings(); });
        ipcMain.handle('desktop:printers', function getPrinters(event) { authorizeBridge(event); return mainWindow.webContents.getPrintersAsync(); });
        ipcMain.handle('desktop:save-print-settings', function savePrintSettings(event, payload) { authorizeBridge(event); return printManager.saveSettings(payload); });
        ipcMain.handle('desktop:choose-pdf-folder', function choosePdfFolder(event) { authorizeBridge(event); return printManager.chooseFolder(); });
        ipcMain.handle('desktop:print-invoices', function printInvoices(event, payload) { authorizeBridge(event); return printManager.printJob(payload); });
        ipcMain.handle('desktop:file-invoices', function fileInvoices(event, payload) { authorizeBridge(event); return printManager.savePdf(payload); });
        Menu.setApplicationMenu(Menu.buildFromTemplate([
            { label: 'File', submenu: [{ role: 'quit', label: 'Exit' }] },
            { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
            { label: 'View', submenu: [{ role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' }, { role: 'togglefullscreen' }] },
            { label: 'Help', submenu: [{ label: 'Check for updates', click: function() { if (app.isPackaged) updates.check({ manual: true }); } }] }
        ]));
        createWindow();
        workflowManager = createWorkflowManager({ userData: app.getPath('userData'), apply: applyWorkflowSettings, shortcutAvailable: function() { return shortcutAvailable; } });
        workflowManager.getSettings().then(applyWorkflowSettings);
        ipcMain.handle('desktop:workflow-settings', function(event) { authorizeBridge(event); return workflowManager.getSettings(); });
        ipcMain.handle('desktop:save-workflow-settings', function(event, payload) { authorizeBridge(event); return workflowManager.saveSettings(payload); });
        ipcMain.handle('desktop:window-kind', function(event) { authorizeBridge(event); return quickWindow && event.sender === quickWindow.webContents ? 'quick-order' : 'main'; });
        ipcMain.handle('desktop:finish-quick-order', function(event) {
            authorizeBridge(event);
            if (quickWindow && event.sender === quickWindow.webContents) {
                if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('desktop:quick-order-saved');
                quickWindow.close();
            }
        });
        ipcMain.handle('desktop:delivery-run', function(event, payload) { authorizeBridge(event); return printManager.printDeliveryRun(payload); });
        if (integrationMode) {
            app.on('desktop-integration-open-quick-order', openQuickOrder);
            require('./integration.cjs').runIntegration(app, mainWindow);
        }
        else if (smokeMode) require('./smoke.cjs').runSmoke(app, mainWindow);
        if (app.isPackaged) {
            updates.check();
            updateTimer = setInterval(function() { updates.check(); }, 60 * 60 * 1000);
        }
    }).catch(function(error) { dialog.showErrorBox('Kyrgyz Organics could not start', error.message); app.quit(); });
    app.on('window-all-closed', function() { app.quit(); });
    app.on('before-quit', function() { quitting = true; globalShortcut.unregisterAll(); if (updateTimer) clearInterval(updateTimer); });
}
