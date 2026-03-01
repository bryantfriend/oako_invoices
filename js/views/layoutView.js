import { Sidebar } from "../components/sidebar.js";
import { authService } from "../core/authService.js";
import { i18n } from "../core/i18n.js";

class LayoutView {
    constructor() {
        this.sidebar = new Sidebar();
        this.unsubscribeI18n = null;
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
                    Dashboard
                </div>
            </div>
            </div>
            <div style="display: flex; align-items: center; gap: var(--space-4);">
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
                <div style="
                    width: 32px; 
                    height: 32px; 
                    background: var(--color-primary-100); 
                    color: var(--color-primary-700); 
                    border-radius: var(--radius-full); 
                    display: flex; 
                    align-items: center; 
                    justify-content: center;
                    font-weight: 600;
                ">
                    ${(user?.email || 'A').charAt(0).toUpperCase()}
                </div>
            </div>
        `;

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
}

export const layoutView = new LayoutView();
