import { createAppInstallService } from '../services/appInstallService.js';

// Loaded independently of Firebase so the browser's install event is captured early.
var installService = createAppInstallService(window);

class AppInstallControl extends HTMLElement {
    connectedCallback() {
        if (this.unsubscribe) return;
        this.innerHTML = '<button type="button" class="btn btn-secondary btn-sm no-print" data-install-open>Install app</button>';
        var control = this;
        this.querySelector('button').addEventListener('click', function() { control.openHelp(); });
        this.unsubscribe = installService.subscribe(function(state) {
            var button = control.querySelector('[data-install-open]');
            button.textContent = state.installed ? 'App installed' : 'Install app';
        });
    }

    disconnectedCallback() {
        if (this.unsubscribe) this.unsubscribe();
        this.unsubscribe = null;
        if (this.dialog) {
            this.dialog.close();
            this.dialog.remove();
        }
    }

    openHelp() {
        if (this.dialog) {
            this.dialog.close();
            this.dialog.remove();
        }
        var dialog = document.createElement('dialog');
        dialog.className = 'app-install-dialog no-print';
        dialog.setAttribute('aria-label', 'Install Kyrgyz Organics');
        dialog.innerHTML = `
            <div class="app-install-heading"><img src="./assets/icons/app-192.png" alt="" width="56" height="56"><div><h2>Kyrgyz Organics</h2><p>Your orders and invoices, one click away.</p></div></div>
            <p>Install the app to open it from your desktop or Start menu in its own window. Use your existing account and shared data.</p>
            <p data-install-status role="status" aria-live="polite"></p>
            <div data-install-guidance>
                <ul>
                    <li><strong>Windows / Chrome or Edge:</strong> use the install icon in the address bar, or the browser menu’s install / Apps option.</li>
                    <li><strong>Mac / Safari:</strong> choose File → Add to Dock, if available.</li>
                    <li><strong>iPhone / iPad:</strong> open in Safari, tap Share, then Add to Home Screen.</li>
                    <li><strong>Android / Chrome:</strong> open the browser menu and choose Install app or Add to Home screen.</li>
                </ul>
                <p>If installation is unavailable, open this site in Chrome or Edge in a regular browsing window.</p>
            </div>
            <div class="app-install-offline"><strong>Before working offline</strong><p>Sign in while online and check Offline readiness from the sync status control. Only data saved on this device is available offline. Reconnect to sync pending changes. Installation does not download all company data.</p><p>Updates appear inside the app. Save edits before choosing Update now; pending changes are checked before refreshing.</p></div>
            <div class="app-install-actions"><button type="button" class="btn btn-secondary" data-install-close>Close</button><button type="button" class="btn btn-primary" data-install-now>Install app</button></div>`;
        document.body.appendChild(dialog);
        this.dialog = dialog;
        var unsubscribe = installService.subscribe(function(state) {
            var button = dialog.querySelector('[data-install-now]');
            button.hidden = (!state.canPrompt && !state.busy) || state.installed;
            button.disabled = state.busy;
            button.textContent = state.busy ? 'Installing…' : 'Install app';
            dialog.querySelector('[data-install-guidance]').hidden = state.installed;
            if (state.installed) dialog.querySelector('[data-install-status]').textContent = 'The app is installed. You can launch it from your device’s apps.';
        });
        dialog.addEventListener('close', function() { unsubscribe(); dialog.remove(); }, { once: true });
        dialog.querySelector('[data-install-close]').addEventListener('click', function() { dialog.close(); });
        dialog.querySelector('[data-install-now]').addEventListener('click', async function() {
            var result = await installService.install();
            var status = dialog.querySelector('[data-install-status]');
            if (installService.getState().installed) return;
            if (result.outcome === 'accepted') status.textContent = 'Installation accepted. Your browser will finish setting up the app.';
            if (result.outcome === 'dismissed') status.textContent = 'Installation cancelled. You can install later using your browser menu.';
            if (result.outcome === 'error') status.textContent = 'Installation could not start. Try the browser menu instructions above.';
        });
        dialog.showModal();
    }
}

customElements.define('app-install-control', AppInstallControl);
