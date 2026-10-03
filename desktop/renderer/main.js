import '../../js/main.js';
import './printing/settingsElement.js';
import { runDesktopPrintAction } from './printing/actions.js';
import { auth } from '../../js/core/firebase.js';
import { offlineQueueService } from '../../js/services/offlineQueueService.js';
import { syncService } from '../../js/services/syncService.js';
import pipeline from '../../js/ICF/engine/pipeline.js';
import registry from '../../js/ICF/engine/intentRegistry.js';
import { createRestartDesktopUpdateIntent } from './update/RestartDesktopUpdateIntent.js';

var banner;
var restartInProgress = false;
window.runDesktopPrintAction = runDesktopPrintAction;
registry.registerIntent('RestartDesktopUpdateIntent', createRestartDesktopUpdateIntent);

async function restartToUpdate() {
    if (restartInProgress) return;
    if (!window.confirm('Save any open edits and finish print jobs before continuing. Restart Kyrgyz Organics to install the downloaded update?')) return;
    restartInProgress = true;
    var button = banner.querySelector('button');
    button.disabled = true;
    button.textContent = 'Checking saved work…';
    try {
        var result = await pipeline.run(createRestartDesktopUpdateIntent(
            { id: auth.currentUser ? auth.currentUser.uid : 'signed-out-device', role: 'user' },
            { confirmed: true },
            {
                getUpdateState: window.desktopApp.getUpdateState,
                listPending: offlineQueueService.listActiveItems.bind(offlineQueueService),
                getUserId: function() { return auth.currentUser ? auth.currentUser.uid : ''; },
                sync: syncService.processQueue.bind(syncService),
                restart: window.desktopApp.restartToUpdate
            }
        ));
        if (!result.ok) window.alert((result.errors || ['Update could not restart.']).join('\n'));
    } catch (error) {
        window.alert('Update could not restart. Your app and saved work remain available.');
    } finally {
        restartInProgress = false;
        button.disabled = false;
        button.textContent = 'Restart to update';
    }
}

function showUpdateState(state) {
    if (!banner) {
        banner = document.createElement('div');
        banner.className = 'desktop-update-banner no-print';
        banner.innerHTML = '<span role="status" aria-live="polite"></span><button type="button" class="btn btn-primary btn-sm">Restart to update</button>';
        banner.querySelector('button').addEventListener('click', restartToUpdate);
        document.body.appendChild(banner);
    }
    banner.style.display = state.status === 'downloading' || state.status === 'ready' ? 'flex' : 'none';
    banner.querySelector('button').hidden = state.status !== 'ready';
    banner.querySelector('span').textContent = state.status === 'ready'
        ? 'Version ' + state.version + ' is ready. Restart when you have finished your work.'
        : 'Downloading update ' + state.version + '… ' + state.percent + '%';
}

document.addEventListener('DOMContentLoaded', function() {
    window.desktopApp.onUpdateState(showUpdateState);
    window.desktopApp.getUpdateState().then(showUpdateState);
});
