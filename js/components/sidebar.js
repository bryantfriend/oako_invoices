import { ROUTES } from "../core/constants.js";
import { authService } from "../core/authService.js";
import { router } from "../router.js";
import { t } from "../core/i18n.js";
import sessionDataStore from "../services/sessionDataStore.js";
import { readCachedRowsAsync } from "../core/firestoreRead.js";
import { runSingleFlight } from "../core/singleFlight.js";

const NAV_ICONS = {
    orders: '<path d="M6 2h9l3 3v15a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z"/><path d="M14 2v4h4"/><path d="M8 11h8"/><path d="M8 15h6"/>',
    plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
    invoices: '<path d="M4 3h16v18l-3-2-3 2-3-2-3 2-4-2Z"/><path d="M8 8h8"/><path d="M8 12h8"/><path d="M8 16h5"/>',
    inventory: '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
    customers: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    settings: '<path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.6 19a1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 5 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15.4 5a1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.2.4.6.8 1 .9.3.1.7.1 1.1.1H21a2 2 0 1 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15Z"/>',
    profile: '<path d="M12 17.8 5.8 21l1.2-6.9L2 9.2l6.9-1L12 2l3.1 6.2 6.9 1-5 4.9 1.2 6.9Z"/>',
    offline: '<path d="M12 3v12"/><path d="m8 11 4 4 4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>'
};

function navIcon(name) {
    return `
        <svg class="sidebar-nav-svg" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            ${NAV_ICONS[name] || NAV_ICONS.orders}
        </svg>
    `;
}

export class Sidebar {
    constructor() {
        this.element = document.getElementById('sidebar');
    }

    render() {
        if (!this.element) return;

        this.element.innerHTML = `
            <div class="sidebar-header">
                <div class="brand-mark">KO</div>
                <div>
                    <h2>Kyrgyz Organics</h2>
                    <div>Wholesale Admin</div>
                </div>
            </div>
            <nav class="sidebar-nav">
                ${this.createNavItem(t('sidebar_orders'), ROUTES.DASHBOARD, 'orders', 'orders')}
                ${this.createNavItem(t('dash_new_order'), ROUTES.CREATE_ORDER, 'plus')}
                ${this.createNavItem(t('sidebar_invoices'), ROUTES.INVOICES, 'invoices', 'invoices')}
                ${this.createNavItem(t('sidebar_inventory'), ROUTES.INVENTORY, 'inventory', 'lowStock')}
                ${this.createNavItem(t('sidebar_customers'), ROUTES.CUSTOMERS, 'customers')}
                ${this.createNavItem(t('sidebar_settings'), ROUTES.SETTINGS, 'settings')}
                ${this.createNavItem('Offline Data', ROUTES.OFFLINE_DATA, 'offline')}
                ${this.createNavItem('Conflicts', ROUTES.SYNC_CONFLICTS, 'settings', 'conflicts')}
                ${this.createNavItem('Profile', ROUTES.PROFILE, 'profile')}
            </nav>

            <div class="sidebar-footer">
                <button id="logout-btn" class="btn btn-secondary sidebar-logout">
                    ${navIcon('logout')} ${t('sidebar_logout')}
                </button>
            </div>
        `;

        this.element.classList.remove('hidden');
        this.attachEvents();
        this.loadBadges();
    }

    createNavItem(label, route, iconName, badgeKey = '') {
        // Check hash instead of pathname for active state
        const currentPath = window.location.hash.slice(1) || '/';
        const isActive = currentPath === route || (route !== ROUTES.DASHBOARD && currentPath.startsWith(route));

        return `
            <a href="#${route}" class="nav-item ${isActive ? 'active' : ''}" ${badgeKey ? `data-badge-key="${badgeKey}"` : ''}>
                <span class="nav-icon">${navIcon(iconName)}</span>
                <span>${label}</span>
                ${badgeKey ? '<span class="nav-badge" hidden></span>' : ''}
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

    async loadBadges() {
        return runSingleFlight('sidebar:badges', this.loadBadgesOnce.bind(this));
    }

    async loadBadgesOnce() {
        const sidebar = this;
        console.info('[SIDEBAR_BADGES] blocking=false');
        const setBadge = function(key, value) {
            const badge = sidebar.element?.querySelector(`[data-badge-key="${key}"] .nav-badge`);
            if (!badge) return;
            if (!value) {
                badge.hidden = true;
                badge.textContent = '';
                return;
            }
            badge.textContent = value > 99 ? '99+' : String(value);
            badge.hidden = false;
        };

        try {
            const orderSnapshot = sessionDataStore.getOrdersSnapshot();
            const invoiceSnapshot = sessionDataStore.getInvoicesSnapshot();
            let orders = orderSnapshot && Array.isArray(orderSnapshot.records) ? orderSnapshot.records : null;
            let invoices = invoiceSnapshot && Array.isArray(invoiceSnapshot.records) ? invoiceSnapshot.records : null;
            let source = orders || invoices ? 'memory' : 'skipped';

            if (!orders) {
                orders = await readCachedRowsAsync('orders:all:createdAt_desc');
                if (orders.length) source = source === 'memory' ? source : 'dexie';
            }
            if (!invoices) {
                const openInvoices = await readCachedRowsAsync('invoices:working:open');
                const todayInvoices = await readCachedRowsAsync('invoices:working:today');
                const recentInvoices = await readCachedRowsAsync('invoices:working:recent');
                invoices = openInvoices.concat(todayInvoices).concat(recentInvoices);
                if (invoices.length) source = source === 'memory' ? source : 'dexie';
            }

            let conflicts = [];
            try {
                const conflictModule = await import("../services/conflictService.js");
                conflicts = await conflictModule.conflictService.getOpenConflicts().catch(function() { return []; });
            } catch (error) {
                conflicts = [];
            }

            setBadge('orders', (orders || []).filter(function(order) { return order && order.archived !== true; }).length);
            setBadge('invoices', (invoices || []).length);
            setBadge('conflicts', conflicts.length);
            setBadge('lowStock', 0);
            console.info('[SIDEBAR_BADGES] source=' + source);
            console.info('[SIDEBAR_BADGES] updated counts only');
        } catch (error) {
            console.info('[SIDEBAR_BADGES] source=skipped');
            console.warn('Sidebar badges unavailable.', error);
        }
    }
}
