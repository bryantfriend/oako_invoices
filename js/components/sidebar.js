import { ROUTES } from "../core/constants.js";
import { authService } from "../core/authService.js";
import { router } from "../router.js";

export class Sidebar {
    constructor() {
        this.element = document.getElementById('sidebar');
    }

    render() {
        if (!this.element) return;

        this.element.innerHTML = `
            <div class="sidebar-header" style="padding: 24px; border-bottom: 1px solid var(--color-gray-200);">
                <h2 style="color: var(--color-primary-600); font-weight: 700;">Kyrgyz Organics</h2>
                <div style="font-size: 12px; color: var(--color-gray-500);">Admin Portal</div>
            </div>
            
            <nav class="sidebar-nav" style="padding: 16px; display: flex; flex-direction: column; gap: 4px;">
                ${this.createNavItem('Orders', ROUTES.DASHBOARD, '📊')}
                ${this.createNavItem('Create Order', ROUTES.CREATE_ORDER, '➕')}
                ${this.createNavItem('Invoices', ROUTES.INVOICES, '📄')}
                ${this.createNavItem('Inventory', ROUTES.INVENTORY, '🍞')}
                ${this.createNavItem('Customers', ROUTES.CUSTOMERS, '👥')}
                ${this.createNavItem('Settings', ROUTES.SETTINGS, '⚙️')}
            </nav>

            <div class="sidebar-footer" style="padding: 16px; margin-top: auto; border-top: 1px solid var(--color-gray-200);">
                <button id="logout-btn" class="btn btn-secondary" style="width: 100%; justify-content: flex-start;">
                    🚪 Logout
                </button>
            </div>
        `;

        this.element.classList.remove('hidden');
        this.attachEvents();
    }

    createNavItem(label, route, icon) {
        // Check hash instead of pathname for active state
        const currentPath = window.location.hash.slice(1) || '/';
        const isActive = currentPath === route;
        const bg = isActive ? 'var(--color-primary-50)' : 'transparent';
        const color = isActive ? 'var(--color-primary-700)' : 'var(--color-gray-700)';
        const weight = isActive ? '600' : '400';

        return `
            <a href="#${route}" class="nav-item" style="
                display: flex; 
                align-items: center; 
                gap: 12px; 
                padding: 10px 12px; 
                border-radius: var(--radius-md); 
                background: ${bg}; 
                color: ${color}; 
                font-weight: ${weight};
                text-decoration: none;
                transition: all var(--transition-fast);
            ">
                <span>${icon}</span>
                <span>${label}</span>
            </a>
        `;
    }

    attachEvents() {
        const logoutBtn = this.element.querySelector('#logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                await authService.logout();
                router.navigate(ROUTES.LOGIN);
            });
        }
    }
}
