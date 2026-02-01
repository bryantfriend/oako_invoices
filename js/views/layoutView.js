import { Sidebar } from "../components/sidebar.js";
import { authService } from "../core/authService.js";

class LayoutView {
    constructor() {
        this.sidebar = new Sidebar();
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
            <div style="display: flex; align-items: center; gap: var(--space-4);">
                <div class="user-info-desktop" style="display: flex; flex-direction: column; align-items: flex-end;">
                    <span style="font-size: var(--text-sm); font-weight: 600;">
                        ${user?.email || 'Admin'}
                    </span>
                    <span style="font-size: var(--text-xs); color: var(--color-gray-500);">
                        Administrator
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

        // Auto-close on route change
        window.addEventListener('hashchange', closeMenu);
    }


    updateTitle(title) {
        const titleEl = document.querySelector('#top-bar > div:first-child');
        if (titleEl) titleEl.textContent = title;
    }
}

export const layoutView = new LayoutView();
