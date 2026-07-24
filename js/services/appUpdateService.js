import { Workbox } from "../../vendor/workbox-window.prod.mjs";
import { APP_CONFIG } from "../config.js";
import { notificationService } from "../core/notificationService.js";
import { offlineStatusService } from "./offlineStatusService.js";
import { syncService } from "./syncService.js";

var activeWorkbox = null;
var activeRegistration = null;
var updateBanner = null;
var reloadedForController = false;
var latestVersion = '';
var updateInProgress = false;
var lastVersionCheckAt = 0;
var versionCheckTimer = null;

var VERSION_CHECK_INTERVAL_MILLISECONDS = 15 * 60 * 1000;
var FOCUS_CHECK_INTERVAL_MILLISECONDS = 60 * 1000;
var WAITING_WORKER_TIMEOUT_MILLISECONDS = 15000;
var ACTIVATION_FALLBACK_MILLISECONDS = 8000;

function removeUpdateBanner() {
    if (updateBanner && updateBanner.parentNode) {
        updateBanner.parentNode.removeChild(updateBanner);
    }
    updateBanner = null;
}

function getUpdateMessage() {
    if (latestVersion) {
        return 'OAKO v' + latestVersion + ' is available. Update with one click—no hard refresh needed.';
    }
    return 'A new version of OAKO is available. Update with one click—no hard refresh needed.';
}

function setUpdateBannerState(message, buttonText, disabled) {
    if (!updateBanner) {
        return;
    }

    var messageElement = updateBanner.querySelector('[data-oako-update-message]');
    var updateButton = updateBanner.querySelector('[data-oako-update-button]');
    var laterButton = updateBanner.querySelector('[data-oako-update-later]');

    if (messageElement) {
        messageElement.textContent = message || getUpdateMessage();
    }
    if (updateButton) {
        updateButton.textContent = buttonText || 'Update now';
        updateButton.disabled = disabled === true;
    }
    if (laterButton) {
        laterButton.disabled = disabled === true;
    }
}

function createUpdateBanner() {
    if (updateBanner) {
        setUpdateBannerState(getUpdateMessage(), 'Update now', false);
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

    var messageElement = document.createElement('span');
    var updateButton = document.createElement('button');
    var laterButton = document.createElement('button');

    messageElement.setAttribute('data-oako-update-message', 'true');
    messageElement.textContent = getUpdateMessage();

    updateButton.setAttribute('data-oako-update-button', 'true');
    updateButton.className = 'btn btn-primary btn-sm';
    updateButton.type = 'button';
    updateButton.textContent = 'Update now';

    laterButton.setAttribute('data-oako-update-later', 'true');
    laterButton.className = 'btn btn-secondary btn-sm';
    laterButton.type = 'button';
    laterButton.textContent = 'Later';

    updateBanner.appendChild(messageElement);
    updateBanner.appendChild(updateButton);
    updateBanner.appendChild(laterButton);
    document.body.appendChild(updateBanner);

    laterButton.addEventListener('click', function() {
        removeUpdateBanner();
    });

    updateButton.addEventListener('click', function() {
        appUpdateService.syncAndActivateUpdate();
    });
}

function markUpdateAvailable(versionInfo) {
    if (versionInfo && versionInfo.appVersion) {
        latestVersion = String(versionInfo.appVersion);
    }
    offlineStatusService.setUpdateAvailable(true);
    createUpdateBanner();
}

function waitForWaitingWorker(registration) {
    return new Promise(function(resolve) {
        var startedAt = Date.now();
        var timer = window.setInterval(function() {
            if (registration && registration.waiting) {
                window.clearInterval(timer);
                resolve(registration.waiting);
                return;
            }
            if (Date.now() - startedAt >= WAITING_WORKER_TIMEOUT_MILLISECONDS) {
                window.clearInterval(timer);
                resolve(null);
            }
        }, 250);
    });
}

async function prepareWaitingWorker() {
    var registration = activeRegistration;
    if (!registration) {
        registration = await navigator.serviceWorker.getRegistration();
        activeRegistration = registration;
    }
    if (!registration) {
        return null;
    }
    if (registration.waiting) {
        return registration.waiting;
    }

    try {
        if (activeWorkbox) {
            await activeWorkbox.update();
        } else {
            await registration.update();
        }
    } catch (error) {
        console.warn('Could not check for the latest service worker.', error);
    }

    if (registration.waiting) {
        return registration.waiting;
    }
    return waitForWaitingWorker(registration);
}

function isOakoStaticCache(cacheName) {
    return cacheName.indexOf('oako-') === 0
        || cacheName.indexOf('oako-invoices-') === 0
        || cacheName.indexOf('workbox-precache') === 0;
}

async function forceFreshReload() {
    try {
        var registration = activeRegistration;
        if (!registration) {
            registration = await navigator.serviceWorker.getRegistration();
        }
        if (registration) {
            await registration.unregister();
        }

        if ('caches' in window) {
            var cacheNames = await caches.keys();
            var staticCacheNames = cacheNames.filter(isOakoStaticCache);
            await Promise.all(staticCacheNames.map(function(cacheName) {
                return caches.delete(cacheName);
            }));
        }
    } catch (error) {
        console.warn('Fresh update cleanup was not fully available.', error);
    }

    var updateUrl = new URL(window.location.href);
    updateUrl.searchParams.set('oakoUpdate', latestVersion || String(Date.now()));
    window.location.replace(updateUrl.toString());
}

function checkForUpdateWhenActive() {
    if (document.visibilityState === 'hidden') {
        return;
    }
    if (Date.now() - lastVersionCheckAt < FOCUS_CHECK_INTERVAL_MILLISECONDS) {
        return;
    }
    appUpdateService.checkDeploymentVersion();
}

function startAutomaticVersionChecks() {
    if (versionCheckTimer) {
        return;
    }

    versionCheckTimer = window.setInterval(function() {
        appUpdateService.checkDeploymentVersion();
    }, VERSION_CHECK_INTERVAL_MILLISECONDS);

    window.addEventListener('focus', checkForUpdateWhenActive);
    window.addEventListener('online', checkForUpdateWhenActive);
    document.addEventListener('visibilitychange', checkForUpdateWhenActive);
}

export const appUpdateService = {
    register() {
        if (!APP_CONFIG.WORKBOX_CACHING_ENABLED) {
            return;
        }
        if (!('serviceWorker' in navigator)) {
            return;
        }

        activeWorkbox = new Workbox('./sw.js', {
            updateViaCache: 'none'
        });

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

        activeWorkbox.register().then(function(registration) {
            activeRegistration = registration;
            startAutomaticVersionChecks();
            appUpdateService.checkDeploymentVersion();
        }).catch(function(error) {
            console.warn('Service worker registration failed.', error);
        });
    },

    async checkDeploymentVersion() {
        lastVersionCheckAt = Date.now();
        try {
            var response = await fetch('./deployment-version.json?updateCheck=' + Date.now(), {
                cache: 'no-store',
                headers: {
                    'Cache-Control': 'no-cache'
                }
            });
            if (!response || !response.ok) {
                return null;
            }
            var versionInfo = await response.json();
            if (versionInfo && versionInfo.appVersion && versionInfo.appVersion !== APP_CONFIG.VERSION) {
                markUpdateAvailable(versionInfo);
                if (activeWorkbox) {
                    activeWorkbox.update().catch(function(error) {
                        console.warn('Could not download the latest service worker.', error);
                    });
                }
            }
            return versionInfo;
        } catch (error) {
            return null;
        }
    },

    async syncAndActivateUpdate() {
        if (updateInProgress) {
            return;
        }

        updateInProgress = true;
        setUpdateBannerState('Saving pending work and preparing the update…', 'Preparing…', true);

        var result;
        try {
            result = await syncService.processQueue();
        } catch (error) {
            updateInProgress = false;
            setUpdateBannerState(getUpdateMessage(), 'Try again', false);
            notificationService.error('The update could not start. Your current app remains available.');
            return;
        }
        if (result.message === 'Offline') {
            updateInProgress = false;
            setUpdateBannerState(getUpdateMessage(), 'Try again', false);
            notificationService.error('Update is ready, but pending changes cannot sync while offline.');
            return;
        }
        if (result.message === 'Authentication required') {
            updateInProgress = false;
            setUpdateBannerState(getUpdateMessage(), 'Try again', false);
            notificationService.error('Sign in before updating so pending changes stay protected.');
            return;
        }
        if (result.failed > 0) {
            updateInProgress = false;
            setUpdateBannerState(getUpdateMessage(), 'Try again', false);
            notificationService.error('Update is ready, but some pending changes still need review.');
            return;
        }

        var waitingWorker = await prepareWaitingWorker();
        if (!waitingWorker) {
            setUpdateBannerState('Opening the latest version…', 'Updating…', true);
            await forceFreshReload();
            return;
        }

        removeUpdateBanner();
        offlineStatusService.setUpdateAvailable(false);
        window.setTimeout(function() {
            forceFreshReload();
        }, ACTIVATION_FALLBACK_MILLISECONDS);
        activeWorkbox.messageSkipWaiting();
    }
};
