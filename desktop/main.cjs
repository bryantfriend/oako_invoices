const { app, BrowserWindow, protocol, net, ipcMain, shell, Menu, dialog } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const { autoUpdater } = require('electron-updater');
const { createUpdateManager } = require('./updateManager.cjs');
const policy = require('./windowPolicy.cjs');
var mainWindow;
var updates;
var updateTimer;
var smokeMode = !app.isPackaged && process.argv.indexOf('--desktop-smoke') !== -1;
if (smokeMode) app.setPath('userData', path.resolve(__dirname, '../.workbox/desktop-smoke-profile'));

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
            return { action: 'allow', overrideBrowserWindowOptions: { webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } } };
        }
        if (policy.isExternalUrl(details.url)) shell.openExternal(details.url);
        return { action: 'deny' };
    });
    window.webContents.on('will-attach-webview', function(event) { event.preventDefault(); });
}

function authorizeBridge(event) {
    if (!mainWindow || event.sender !== mainWindow.webContents || !event.senderFrame || event.senderFrame !== mainWindow.webContents.mainFrame || !policy.isAppUrl(event.senderFrame.url)) {
        throw new Error('Desktop action is unavailable in this window.');
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        title: 'Kyrgyz Organics', width: 1360, height: 900, minWidth: 900, minHeight: 650,
        backgroundColor: '#ffffff', show: false, icon: path.join(__dirname, 'app/assets/icons/app-512.png'),
        webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, offscreen: smokeMode, backgroundThrottling: !smokeMode }
    });
    mainWindow.once('ready-to-show', function() { if (!smokeMode) mainWindow.show(); });
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
        if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
    });
    app.on('browser-window-created', function(event, window) {
        if (window !== mainWindow) protectWindow(window);
    });
    app.whenReady().then(function() {
        var appRoot = path.join(__dirname, 'app');
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
            if (app.isPackaged) await updates.check();
            return updates.getState();
        });
        ipcMain.handle('desktop:install-update', function(event) { authorizeBridge(event); return updates.install(); });
        Menu.setApplicationMenu(Menu.buildFromTemplate([
            { label: 'File', submenu: [{ role: 'quit', label: 'Exit' }] },
            { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
            { label: 'View', submenu: [{ role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' }, { role: 'togglefullscreen' }] },
            { label: 'Help', submenu: [{ label: 'Check for updates', click: function() { if (app.isPackaged) updates.check(); } }] }
        ]));
        createWindow();
        if (smokeMode) require('./smoke.cjs').runSmoke(app, mainWindow);
        if (app.isPackaged) {
            updates.check();
            updateTimer = setInterval(function() { updates.check(); }, 60 * 60 * 1000);
        }
    }).catch(function(error) { dialog.showErrorBox('Kyrgyz Organics could not start', error.message); app.quit(); });
    app.on('window-all-closed', function() { app.quit(); });
    app.on('before-quit', function() { if (updateTimer) clearInterval(updateTimer); });
}
