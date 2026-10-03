const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopApp', {
    publicAppUrl: 'https://bryantfriend.github.io/oako_invoices/index.html',
    getPrintSettings: function getPrintSettings() { return ipcRenderer.invoke('desktop:print-settings'); },
    getPrinters: function getPrinters() { return ipcRenderer.invoke('desktop:printers'); },
    savePrintSettings: function savePrintSettings(payload) { return ipcRenderer.invoke('desktop:save-print-settings', payload); },
    choosePdfFolder: function choosePdfFolder() { return ipcRenderer.invoke('desktop:choose-pdf-folder'); },
    printInvoices: function printInvoices(payload) { return ipcRenderer.invoke('desktop:print-invoices', payload); },
    fileInvoices: function fileInvoices(payload) { return ipcRenderer.invoke('desktop:file-invoices', payload); },
    getUpdateState: function() { return ipcRenderer.invoke('desktop:update-state'); },
    checkForUpdates: function() { return ipcRenderer.invoke('desktop:check-update'); },
    restartToUpdate: function() { return ipcRenderer.invoke('desktop:install-update'); },
    onUpdateState: function(callback) {
        function receive(event, state) { callback(state); }
        ipcRenderer.on('desktop:update-state', receive);
        return function() { ipcRenderer.removeListener('desktop:update-state', receive); };
    }
});
