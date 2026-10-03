function createUpdateManager(updater, publish) {
    var state = { status: 'idle', version: '', percent: 0 };
    var checking = false;
    updater.autoDownload = true;
    // Staff explicitly restart after saving; do not install during ordinary exit.
    updater.autoInstallOnAppQuit = false;
    updater.allowPrerelease = false;

    function setState(status, details) {
        state = Object.assign({ status: status, version: state.version, percent: 0 }, details || {});
        publish(Object.assign({}, state));
    }

    updater.on('checking-for-update', function() { setState('checking'); });
    updater.on('update-available', function(info) { setState('downloading', { version: info.version }); });
    updater.on('download-progress', function(progress) { setState('downloading', { percent: Math.round(progress.percent) }); });
    updater.on('update-not-available', function() { setState('current'); });
    updater.on('update-downloaded', function(info) { setState('ready', { version: info.version, percent: 100 }); });
    updater.on('error', function(error) {
        console.warn('Desktop update unavailable:', error.message);
        setState('error');
    });

    return {
        getState: function() { return Object.assign({}, state); },
        check: async function() {
            if (checking || state.status === 'downloading' || state.status === 'ready') return;
            checking = true;
            try { await updater.checkForUpdates(); } catch (error) { setState('error'); }
            finally { checking = false; }
        },
        install: function() {
            if (state.status !== 'ready') return false;
            updater.quitAndInstall(false, true);
            return true;
        }
    };
}

module.exports = { createUpdateManager: createUpdateManager };
