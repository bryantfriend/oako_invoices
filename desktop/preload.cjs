const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopApp', {
    publicAppUrl: 'https://bryantfriend.github.io/oako_invoices/index.html',
    getUpdateState: function() { return ipcRenderer.invoke('desktop:update-state'); },
    checkForUpdates: function() { return ipcRenderer.invoke('desktop:check-update'); },
    restartToUpdate: function() { return ipcRenderer.invoke('desktop:install-update'); },
    onUpdateState: function(callback) {
        function receive(event, state) { callback(state); }
        ipcRenderer.on('desktop:update-state', receive);
        return function() { ipcRenderer.removeListener('desktop:update-state', receive); };
    }
});
