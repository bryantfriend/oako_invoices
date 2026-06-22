import { Sidebar } from "../components/sidebar.js";
import { authService } from "../core/authService.js";
import { i18n } from "../core/i18n.js";
import { APP_CONFIG } from "../config.js";
import { ROUTES } from "../core/constants.js";
import { router } from "../router.js";
import { gamificationService } from "../services/gamificationService.js";
import { notificationService } from "../core/notificationService.js";
import { renderSyncStatusBadge } from "../components/syncStatusBadge.js";
import { offlineStatusService } from "../services/offlineStatusService.js";
import { syncService } from "../services/syncService.js";
import { syncDiagnosticsService } from "../services/syncDiagnosticsService.js";
import { Modal } from "../components/modal.js";

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

class LayoutView {
    constructor() {
        this.sidebar = new Sidebar();
        this.unsubscribeI18n = null;
        this.unsubscribeSync = null;
    }

    render() {
        // Show layout elements
        document.getElementById('sidebar')?.classList.remove('hidden');
        document.getElementById('top-bar')?.classList.remove('hidden');

        // ALWAYS render sidebar (no conditional)
        this.sidebar.render();

        // Render header content
        const topBar = document.getElementById('top-bar');
        const user = authService.getCurrentUser();

        topBar.innerHTML = `
            <div style="display: flex; align-items: center; gap: var(--space-3);">
                <button class="hamburger-btn" id="mobile-menu-toggle">
                    <span></span>
                    <span></span>
                    <span></span>
                </button>
                <div id="top-bar-title" style="font-weight: 600; font-size: var(--text-lg); color: var(--color-gray-800);">
                    ${i18n.t('sidebar_orders')}
                </div>
                <div style="
                    font-size: 11px;
                    font-weight: 700;
                    color: var(--color-gray-500);
                    background: var(--color-gray-100);
                    border: 1px solid var(--color-gray-200);
                    border-radius: 999px;
                    padding: 2px 8px;
                ">
                    v${APP_CONFIG.VERSION}
                </div>
            </div>
            </div>
            <div style="display: flex; align-items: center; gap: var(--space-4);">
                <div id="sync-status-mount"></div>
                <!-- Language Selector -->
                <div class="language-selector">
                    <button class="language-btn" title="Change Language">
                        🌐
                    </button>
                    <div class="language-dropdown">
                        <button class="lang-option ${i18n.getLanguage() === 'en' ? 'active' : ''}" data-lang="en">
                            <span class="lang-flag">🇺🇸</span> EN
                        </button>
                        <button class="lang-option ${i18n.getLanguage() === 'ru' ? 'active' : ''}" data-lang="ru">
                            <span class="lang-flag">🇷🇺</span> RU
                        </button>
                        <button class="lang-option ${i18n.getLanguage() === 'kg' ? 'active' : ''}" data-lang="kg">
                            <span class="lang-flag">🇰🇬</span> KG
                        </button>
                    </div>
                </div>

                <div class="user-info-desktop" style="display: flex; flex-direction: column; align-items: flex-end;">
                    <span style="font-size: var(--text-sm); font-weight: 600;">
                        ${user?.email || 'Admin'}
                    </span>
                    <span style="font-size: var(--text-xs); color: var(--color-gray-500);">
                        ${i18n.t('topbar_admin')}
                    </span>
                </div>
                <button id="profile-shortcut" title="Open Profile" style="
                    width: 32px; 
                    height: 32px; 
                    background: var(--color-primary-100); 
                    color: var(--color-primary-700); 
                    border-radius: var(--radius-full); 
                    display: flex; 
                    align-items: center; 
                    justify-content: center;
                    font-weight: 600;
                    border: none;
                    cursor: pointer;
                    overflow: hidden;
                    padding: 0;
                ">
                    ${(user?.email || 'A').charAt(0).toUpperCase()}
                </button>
            </div>
        `;

        this.updateSyncBadge();
        if (this.unsubscribeSync) {
            this.unsubscribeSync();
        }
        const layout = this;
        this.unsubscribeSync = offlineStatusService.subscribe(function() {
            layout.updateSyncBadge();
        });

        const profileShortcut = document.getElementById('profile-shortcut');
        profileShortcut?.addEventListener('click', () => router.navigate(ROUTES.PROFILE));
        if (profileShortcut && user) {
            gamificationService.getProfile().then(profile => {
                if (profile?.photoDataUrl) {
                    profileShortcut.innerHTML = `<img src="${profile.photoDataUrl}" style="width: 100%; height: 100%; object-fit: cover;">`;
                }
            }).catch(() => null);
        }

        // Mobile Menu Interactivity
        const toggle = document.getElementById('mobile-menu-toggle');
        const sidebar = document.getElementById('sidebar');

        // Create overlay if not exists
        let overlay = document.querySelector('.mobile-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'mobile-overlay';
            document.body.appendChild(overlay);
        }

        const closeMenu = () => {
            sidebar?.classList.remove('active');
            overlay?.classList.remove('active');
        };

        toggle?.addEventListener('click', () => {
            sidebar?.classList.toggle('active');
            overlay?.classList.toggle('active');
        });

        overlay?.addEventListener('click', closeMenu);

        overlay?.addEventListener('click', closeMenu);

        // Auto-close on route change
        window.addEventListener('hashchange', closeMenu);

        // Language Selector Events
        const dropdownBtns = topBar.querySelectorAll('.lang-option');
        dropdownBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const selectedLang = e.currentTarget.dataset.lang;
                if (selectedLang && selectedLang !== i18n.getLanguage()) {
                    i18n.setLanguage(selectedLang);
                }
            });
        });

        // Global State Binding
        if (this.unsubscribeI18n) {
            this.unsubscribeI18n();
        }
        this.unsubscribeI18n = i18n.subscribe(() => {
            // Re-render the Layout (Updates Globe and Sidebar)
            this.render();
            // Re-render whatever view we are currently on (hash reload)
            window.dispatchEvent(new CustomEvent('hashchange'));
        });
    }


    updateTitle(title) {
        const titleEl = document.getElementById('top-bar-title');
        if (titleEl) titleEl.textContent = title;
    }

    updateSyncBadge() {
        const mount = document.getElementById('sync-status-mount');
        if (!mount) {
            return;
        }

        mount.innerHTML = renderSyncStatusBadge(offlineStatusService.getSnapshot());

        const button = document.getElementById('sync-now-btn');
        if (button) {
            button.addEventListener('click', async function() {
            try {
                const result = await syncService.processQueue();
                if (result.message === 'Offline') {
                    notificationService.error('Offline mode. Sync will run when internet returns.');
                    return;
                }
                notificationService.info('Sync complete: ' + result.synced + ' synced, ' + result.failed + ' failed.');
            } catch (error) {
                console.error('Manual sync failed.', error);
                notificationService.error('Sync failed. Pending changes were kept.');
            }
            });
        }

        const detailsButton = document.getElementById('sync-details-btn');
        if (detailsButton) {
            detailsButton.addEventListener('click', async function() {
                const diagnostics = await syncDiagnosticsService.getDiagnostics();
                const modal = new Modal({
                    title: 'Synchronization Details',
                    size: 'large',
                    footer: false,
                    content: `
                        <div class="no-print" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; margin-bottom: 16px;">
                            <div><strong>App</strong><br>${escapeHtml(diagnostics.appVersion)}</div>
                            <div><strong>Service Worker</strong><br>${escapeHtml(diagnostics.serviceWorkerVersion)}</div>
                            <div><strong>Dexie Schema</strong><br>${escapeHtml(diagnostics.dexieSchemaVersion)}</div>
                            <div><strong>User</strong><br>${escapeHtml(diagnostics.authenticatedUser)}</div>
                            <div><strong>Pending</strong><br>${escapeHtml(diagnostics.pendingIntentCount)}</div>
                            <div><strong>Conflicts</strong><br>${escapeHtml(diagnostics.conflictCount)}</div>
                            <div><strong>Failed</strong><br>${escapeHtml(diagnostics.failedIntentCount)}</div>
                            <div><strong>Last Sync</strong><br>${escapeHtml(diagnostics.lastSuccessfulSynchronization || 'Not synced yet')}</div>
                        </div>
                        <pre class="no-print" style="white-space: pre-wrap; background: var(--color-gray-100); border: 1px solid var(--color-gray-200); border-radius: 8px; padding: 12px; font-size: 11px; max-height: 320px; overflow: auto;">${escapeHtml(JSON.stringify(diagnostics.queue.summary, null, 2))}</pre>
                    `
                });
                modal.open();
            });
        }
    }
}

export const layoutView = new LayoutView();
