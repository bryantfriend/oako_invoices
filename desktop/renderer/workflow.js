import { store } from '../../js/core/store.js';
import { authService } from '../../js/core/authService.js';
import sessionDataStore from '../../js/services/sessionDataStore.js';
import { customerService } from '../../js/services/customerService.js';
import { productService } from '../../js/services/productService.js';
import { offlineStatusService } from '../../js/services/offlineStatusService.js';
import { runDesktopPrintAction } from './printing/actions.js';
import { router } from '../../js/router.js';

var warming = false;
var lastWarmAt = 0;
var warmOwner = '';
var lastAttemptOwner = '';
var configuring = false;
var windowKind = '';
var enteredOrder = false;
var savingQuickOrder = false;

async function warmData() {
    var user = authService.getAuthDebugState();
    if (windowKind !== 'main' || warming || !user.isAdmin || !user.signedIn || !offlineStatusService.isOnline() || warmOwner === user.uid || (lastAttemptOwner === user.uid && Date.now() - lastWarmAt < 300000)) return;
    warming = true;
    lastWarmAt = Date.now();
    lastAttemptOwner = user.uid;
    try {
        // Existing authenticated reads and ICF cache flows own authorization.
        var results = await Promise.allSettled([sessionDataStore.loadOrders({ source: 'desktop-cache-warm' }), sessionDataStore.loadInvoices({ source: 'desktop-cache-warm' }), customerService.getAllCustomers(), productService.getAllProducts()]);
        if (results.every(function success(result) { return result.status === 'fulfilled'; })) warmOwner = user.uid;
    } finally { warming = false; }
}

async function applyInitialPreferences() {
    var user = authService.getAuthDebugState();
    if (configuring || windowKind !== 'main' || !user.isAdmin || !user.signedIn) return;
    configuring = true;
    try {
        var settings = await window.desktopApp.getWorkflowSettings();
        if (!settings.initialized) await runDesktopPrintAction('saveWorkflow', { background: true, startAtLogin: true, shortcut: true });
    } catch (error) { console.warn('Windows workflow preferences could not initialize.', error.message); }
    finally { configuring = false; }
}

function handleState() {
    applyInitialPreferences();
    if (windowKind === 'quick-order') {
        var state = store.getState();
        if (state.authReady && state.isAdmin && !enteredOrder) {
            enteredOrder = true;
            router.navigate('/orders/create');
        }
    }
    warmData();
}

export async function initializeDesktopWorkflow() {
    windowKind = await window.desktopApp.getWindowKind();
    if (windowKind === 'quick-order') {
        document.body.classList.add('desktop-quick-order');
        document.addEventListener('submit', function submittingOrder(event) {
            if (event.target && event.target.id === 'create-order-form') savingQuickOrder = true;
        }, true);
        window.addEventListener('hashchange', function finishOrder() {
            if (!enteredOrder || window.location.hash !== '#/') return;
            if (savingQuickOrder) window.desktopApp.finishQuickOrder();
            else if (authService.getAuthDebugState().isAdmin) router.navigate('/orders/create');
        });
    } else {
        window.desktopApp.onQuickOrderSaved(async function reloadSavedOrders() {
            // Drop only this renderer's memory. Durable caches and queued work
            // remain intact, including orders saved offline in the quick window.
            sessionDataStore.clearUserScopedMemory('quick-order-saved');
            await Promise.allSettled([sessionDataStore.loadOrders({ source: 'quick-order-saved' }), sessionDataStore.loadInvoices({ source: 'quick-order-saved' })]);
            lastWarmAt = 0;
        });
        window.setInterval(warmData, 30000);
        window.addEventListener('kyrgyz-organics-online', warmData);
    }
    store.subscribe(handleState);
    handleState();
}
