import { Workbox } from "../../vendor/workbox-window.prod.mjs";
import { APP_CONFIG } from "../config.js";
import { notificationService } from "../core/notificationService.js";
import { offlineStatusService } from "./offlineStatusService.js";
import { syncService } from "./syncService.js";

var activeWorkbox = null;
var updateBanner = null;
var reloadedForController = false;

function removeUpdateBanner() {
    if (updateBanner && updateBanner.parentNode) {
        updateBanner.parentNode.removeChild(updateBanner);
    }
    updateBanner = null;
}

function createUpdateBanner() {
    if (updateBanner) {
        return;
    }

    updateBanner = document.createElement('div');
    updateBanner.className = 'oako-update-banner no-print';
    updateBanner.style.cssText = [
        'position: fixed',
        'left: 16px',
        'right: 16px',
        'bottom: 16px',
        'z-index: 2000',
        'display: flex',
        'align-items: center',
        'justify-content: center',
        'gap: 12px',
        'padding: 12px 16px',
        'border: 1px solid #c7d2fe',
        'border-radius: 8px',
        'background: #eef2ff',
        'color: #3730a3',
        'font-size: 13px',
        'font-weight: 800',
        'box-shadow: 0 10px 30px rgba(0,0,0,0.12)'
    ].join(';');

    updateBanner.innerHTML = [
        '<span>A new version of OAKO is available.</span>',
        '<button id="oako-sync-update-btn" class="btn btn-primary btn-sm" type="button">Sync and update</button>',
        '<button id="oako-later-update-btn" class="btn btn-secondary btn-sm" type="button">Later</button>'
    ].join('');

    document.body.appendChild(updateBanner);

    document.getElementById('oako-later-update-btn').addEventListener('click', function() {
        removeUpdateBanner();
    });

    document.getElementById('oako-sync-update-btn').addEventListener('click', function() {
        appUpdateService.syncAndActivateUpdate();
    });
}

function markUpdateAvailable() {
    offlineStatusService.setUpdateAvailable(true);
    createUpdateBanner();
}

export const appUpdateService = {
    register() {
        if (!APP_CONFIG.WORKBOX_CACHING_ENABLED) {
            return;
        }
        if (!('serviceWorker' in navigator)) {
            return;
        }

        activeWorkbox = new Workbox('./sw.js');

        activeWorkbox.addEventListener('waiting', function() {
            markUpdateAvailable();
        });

        activeWorkbox.addEventListener('externalwaiting', function() {
            markUpdateAvailable();
        });

        activeWorkbox.addEventListener('controlling', function() {
            if (reloadedForController) {
                return;
            }
            reloadedForController = true;
            window.location.reload();
        });

        activeWorkbox.register().then(function() {
            appUpdateService.checkDeploymentVersion();
        }).catch(function(error) {
            console.warn('Service worker registration failed.', error);
        });
    },

    async checkDeploymentVersion() {
        try {
            var response = await fetch('./deployment-version.json?ts=' + Date.now(), {
                cache: 'no-store'
            });
            if (!response || !response.ok) {
                return null;
            }
            var versionInfo = await response.json();
            if (versionInfo && versionInfo.appVersion && versionInfo.appVersion !== APP_CONFIG.VERSION) {
                markUpdateAvailable();
            }
            return versionInfo;
        } catch (error) {
            return null;
        }
    },

    async syncAndActivateUpdate() {
        if (!activeWorkbox) {
            return;
        }

        var result = await syncService.processQueue();
        if (result.message === 'Offline') {
            notificationService.error('Update is ready, but pending changes cannot sync while offline.');
            return;
        }
        if (result.message === 'Authentication required') {
            notificationService.error('Sign in before updating so pending changes stay protected.');
            return;
        }
        if (result.failed > 0) {
            notificationService.error('Update is ready, but some pending changes still need review.');
            return;
        }

        removeUpdateBanner();
        offlineStatusService.setUpdateAvailable(false);
        activeWorkbox.messageSkipWaiting();
    }
};
