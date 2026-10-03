// Installation only opens browser-owned UI; it does not mutate business data.
export function createAppInstallService(browserWindow) {
    var pendingPrompt = null;
    var installed = false;
    var busy = false;
    var listeners = [];
    var standalone = browserWindow.matchMedia('(display-mode: standalone)');

    function getState() {
        return {
            installed: installed || standalone.matches || browserWindow.navigator.standalone === true,
            canPrompt: Boolean(pendingPrompt) && browserWindow.isSecureContext === true,
            busy: busy
        };
    }

    function publish() {
        listeners.forEach(function(listener) { listener(getState()); });
    }

    browserWindow.addEventListener('beforeinstallprompt', function(event) {
        event.preventDefault();
        pendingPrompt = event;
        publish();
    });
    browserWindow.addEventListener('appinstalled', function() {
        installed = true;
        pendingPrompt = null;
        publish();
    });
    if (standalone.addEventListener) {
        standalone.addEventListener('change', publish);
    }

    return {
        getState: getState,
        subscribe: function(listener) {
            listeners.push(listener);
            listener(getState());
            return function() {
                listeners = listeners.filter(function(candidate) { return candidate !== listener; });
            };
        },
        install: async function() {
            if (busy || getState().installed || !getState().canPrompt) {
                return { outcome: 'unavailable' };
            }
            var prompt = pendingPrompt;
            pendingPrompt = null; // Browser prompts can only be used once.
            busy = true;
            publish();
            try {
                // Keep this call before any await to preserve the user's gesture.
                await prompt.prompt();
                var choice = await prompt.userChoice;
                return { outcome: choice.outcome };
            } catch (error) {
                return { outcome: 'error' };
            } finally {
                busy = false;
                publish();
            }
        }
    };
}
