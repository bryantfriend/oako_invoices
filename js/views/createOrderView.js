import { layoutView } from "./layoutView.js";
import { createOrderController } from "../controllers/createOrderController.js";
import { productService } from "../services/productService.js";
import { settingsService } from "../services/settingsService.js";
import { authService } from "../core/authService.js";
import {
    applyPriceOverrideToItem,
    buildPricedOrderItemFromProduct,
    calculateOrderTotals,
    clearPriceOverrideFromItem,
    normalizeDefaultOrderPriceMode,
    normalizeOrderItemPricing,
    ORDER_PRICE_MODES,
    repriceOrderItem,
    snapshotProductPrices,
    toFinitePrice,
    tryGetProductPriceByMode
} from "../core/pricing.js";
import { customerController } from "../controllers/customerController.js";
import { FormRepeater } from "../components/formRepeater.js";
import { createCard } from "../components/card.js";
import { notificationService } from "../core/notificationService.js";
import { Modal } from "../components/modal.js";
import { DataTable } from "../components/dataTable.js";
import { formatCurrency, formatDate } from "../core/formatters.js";
import { t } from "../core/i18n.js";
import { readCachedRowsAsync } from "../core/firestoreRead.js";
import { getCurrentNavigationId, isNavigationStillCurrent, ignoreStaleRouteResult } from "../core/routeGuard.js";
import { runSingleFlight } from "../core/singleFlight.js";

function escapeHtml(value = '') {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function withDependencyTimeout(promise, timeoutMs, label) {
    return Promise.race([
        promise,
        new Promise(function(resolve) {
            window.setTimeout(function() {
                resolve({ status: 'rejected', reason: new Error(label + ' timed out after ' + timeoutMs + 'ms') });
            }, timeoutMs);
        })
    ]);
}


function normalizeCreateOrderProducts(rows) {
    return (Array.isArray(rows) ? rows : []).map(function(row) {
        var data = row || {};
        var name = data.name || data.name_en || data.title || data.title_en || 'Unknown Product';
        var retailPrice = tryGetProductPriceByMode(data, ORDER_PRICE_MODES.RETAIL);
        var businessPrice = tryGetProductPriceByMode(data, ORDER_PRICE_MODES.BUSINESS);
        return Object.assign({}, data, {
            id: data.id,
            displayName: name,
            retailPrice: retailPrice.ok ? retailPrice.price : 0,
            businessPrice: businessPrice.ok ? businessPrice.price : null,
            price: retailPrice.ok ? retailPrice.price : 0
        });
    }).filter(function(product) {
        return product.archived !== true && product.active !== false;
    });
}

function normalizeCreateOrderCategories(rows) {
    return (Array.isArray(rows) ? rows : []).map(function(row) {
        var data = row || {};
        return Object.assign({}, data, {
            id: data.id,
            name: data.name || data.name_en || 'Unknown Category'
        });
    }).filter(function(category) {
        return category.archived !== true && category.active !== false;
    });
}

function normalizeCreateOrderCustomers(rows) {
    return (Array.isArray(rows) ? rows : []).filter(function(customer) {
        return customer && customer.archived !== true;
    }).sort(function(a, b) {
        return String(a.companyName || a.name || '').localeCompare(String(b.companyName || b.name || ''));
    });
}

function getCreateOrderSettingsSource(settings) {
    if (settings && settings.__fromCache) return 'firestore-cache';
    if (settings && settings.__fromFallback) return 'default';
    return settings ? 'memory' : 'default';
}

async function loadCreateOrderDependenciesOnce() {
    var products = [];
    var categories = [];
    var customers = [];
    var invoiceSettings = {};
    var sources = {
        products: 'unavailable',
        categories: 'unavailable',
        customers: 'unavailable',
        settings: 'default'
    };
    var warnings = [];

    var cachedRows = await Promise.all([
        readCachedRowsAsync('products:all').catch(function() { return []; }),
        readCachedRowsAsync('categories:all').catch(function() { return []; }),
        readCachedRowsAsync('customers:all').catch(function() { return []; }),
        readCachedRowsAsync('settings:invoice_config').catch(function() { return []; })
    ]);

    products = normalizeCreateOrderProducts(cachedRows[0]);
    categories = normalizeCreateOrderCategories(cachedRows[1]);
    customers = normalizeCreateOrderCustomers(cachedRows[2]);
    invoiceSettings = cachedRows[3] && cachedRows[3][0] ? cachedRows[3][0] : {};

    if (products.length) sources.products = 'dexie';
    if (categories.length) sources.categories = 'dexie';
    if (customers.length) sources.customers = 'dexie';
    if (cachedRows[3] && cachedRows[3][0]) sources.settings = 'firestore-cache';

    var liveResults = await Promise.all([
        products.length ? Promise.resolve({ status: 'fulfilled', value: products, source: sources.products }) : withDependencyTimeout(productService.getAllProducts().then(function(value) { return { status: 'fulfilled', value: value, source: 'firestore-server' }; }).catch(function(error) { return { status: 'rejected', reason: error }; }), 12000, 'products'),
        Promise.resolve({ status: 'fulfilled', value: categories, source: sources.categories }),
        customers.length ? Promise.resolve({ status: 'fulfilled', value: customers, source: sources.customers }) : withDependencyTimeout(customerController.loadAllCustomers().then(function(value) { return { status: 'fulfilled', value: value, source: 'firestore-server' }; }).catch(function(error) { return { status: 'rejected', reason: error }; }), 12000, 'customers'),
        Object.keys(invoiceSettings).length ? Promise.resolve({ status: 'fulfilled', value: invoiceSettings, source: sources.settings }) : Promise.resolve({ status: 'fulfilled', value: {}, source: 'default' })
    ]);

    if (liveResults[0].status === 'fulfilled') {
        products = liveResults[0].value || [];
        sources.products = liveResults[0].source || sources.products;
    } else {
        warnings.push('products');
    }
    if (liveResults[1].status === 'fulfilled') {
        categories = liveResults[1].value || [];
        sources.categories = liveResults[1].source || sources.categories;
    } else {
        warnings.push('categories');
    }
    if (liveResults[2].status === 'fulfilled') {
        customers = liveResults[2].value || [];
        sources.customers = liveResults[2].source || sources.customers;
    } else {
        warnings.push('customers');
    }
    if (liveResults[3].status === 'fulfilled') {
        invoiceSettings = liveResults[3].value || {};
        sources.settings = liveResults[3].source || getCreateOrderSettingsSource(invoiceSettings);
    } else {
        warnings.push('settings');
    }

    window.setTimeout(function() {
        console.info('[CREATE_ORDER] server refresh background=true');
        Promise.all([
            productService.getAllProducts().catch(function() { return []; }),
            productService.getAllCategories().catch(function() { return []; }),
            customerController.loadAllCustomers().catch(function() { return []; }),
            settingsService.getInvoiceSettings().catch(function() { return {}; })
        ]).catch(function(error) {
            console.warn('[CREATE_ORDER] background dependency refresh failed.', error);
        });
    }, 0);

    return {
        products: products,
        categories: categories,
        customers: customers,
        invoiceSettings: invoiceSettings,
        sources: sources,
        warnings: warnings
    };
}
function renderCreateOrderLoadingShell() {
    return [
        '<div class="animate-fade-in grid-cols-mobile-1" style="display: grid; grid-template-columns: 2fr 1fr; gap: var(--space-6); align-items: start;">',
        '  <div class="dashboard-card" style="padding: var(--space-6);">',
        '    <h2 style="margin: 0 0 8px; color: var(--color-gray-900);">Create New Order</h2>',
        '    <p style="margin: 0; color: var(--color-gray-600);">Loading products, customers, and pricing settings...</p>',
        '  </div>',
        '</div>'
    ].join('');
}

export const renderCreateOrder = async (params, routeContext) => {
    var navigationId = routeContext && routeContext.navigationId ? routeContext.navigationId : getCurrentNavigationId();
    var expectedRoute = 'create-order';
    layoutView.render('route-change');
    layoutView.updateTitle(t('order_create_title'));

    const container = document.getElementById('page-container');
    console.info('[CREATE_ORDER] route mounted');
    container.innerHTML = renderCreateOrderLoadingShell();

    const dependencyStartedAt = Date.now();
    const dependencyResult = await runSingleFlight('createOrder:dependencies', loadCreateOrderDependenciesOnce);
    if (!isNavigationStillCurrent(navigationId, expectedRoute)) {
        ignoreStaleRouteResult('create-order-dependencies', expectedRoute, navigationId);
        return;
    }
    let products = dependencyResult.products || [];
    let categories = dependencyResult.categories || [];
    let customers = dependencyResult.customers || [];
    const invoiceSettings = dependencyResult.invoiceSettings || {};
    const dependencyWarnings = dependencyResult.warnings || [];
    const dependencySources = dependencyResult.sources || {};
    console.info('[CREATE_ORDER] products source=' + (dependencySources.products || 'unavailable'));
    console.info('[CREATE_ORDER] customers source=' + (dependencySources.customers || 'unavailable'));
    console.info('[CREATE_ORDER] categories source=' + (dependencySources.categories || 'unavailable'));
    console.info('[CREATE_ORDER] settings source=' + (dependencySources.settings || 'default'));
    console.info('[CREATE_ORDER] form ready ms=' + (Date.now() - dependencyStartedAt));
    let selectedPriceMode = normalizeDefaultOrderPriceMode(invoiceSettings.defaultOrderPriceMode);
    console.info('[PRICING] defaultOrderPriceMode loaded: ' + selectedPriceMode);
    let selectedItems = []; // { productId, name, unitPrice, priceMode, quantity, imageUrl }
    let repeatOrderDraft = null;
    try {
        repeatOrderDraft = JSON.parse(sessionStorage.getItem('repeatOrderDraft') || 'null');
        sessionStorage.removeItem('repeatOrderDraft');
    } catch (error) {
        repeatOrderDraft = null;
    }

    const categoryNameById = categories.reduce((map, category) => {
        map[category.id] = category.name || category.name_en || 'Uncategorized';
        return map;
    }, {});

    const customerDatalist = customers.map(c => `<option value="${c.companyName || c.name}">`).join('');

    container.innerHTML = `
        <div class="animate-fade-in grid-cols-mobile-1" style="display: grid; grid-template-columns: 2fr 1fr; gap: var(--space-6); align-items: start;">
            <form id="create-order-form">
                ${dependencyWarnings.length ? '<div class="dashboard-alert-strip" style="margin-bottom: var(--space-4);">Limited connection: ' + escapeHtml(dependencyWarnings.join(', ')) + ' did not finish loading. You can still create an order with available data.</div>' : ''}
                ${createCard({
        title: 'Customer Information',
        content: `
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4);">
                            <div class="input-group">
                                <label for="customerName">Customer / Company</label>
                                <div style="display: flex; gap: var(--space-2);">
                                    <div style="position: relative; flex: 1;">
                                        <span style="position: absolute; left: 10px; top: 10px;">🏢</span>
                                        <input type="text" id="customerName" name="customerName"
                                            required placeholder="Enter or select company..."
                                            style="padding-left: 36px; width: 100%;" autocomplete="off" value="${escapeHtml(repeatOrderDraft?.customerName || '')}">
                                    </div>
                                    <button type="button" id="select-customer-btn" class="btn btn-secondary" title="Select from List" style="padding: 0 12px; font-size: 14px;">
                                        📋
                                    </button>
                                    <button type="button" id="quick-add-customer-btn" class="btn btn-secondary" title="Add New Customer" style="padding: 0 12px;">
                                        ➕
                                    </button>
                                </div>
                                <small style="color: var(--color-gray-500); cursor: pointer;" id="auto-fill-hint">
                                    ✨ Tip: Use 📋 to see all companies by category
                                </small>
                            </div>
                            <div class="input-group">
                                <label for="orderDate">Order / Delivery Date</label>
                                <input type="date" id="orderDate" name="orderDate" class="input" required style="width: 100%;">
                            </div>
                        </div>
                        <div class="input-group" style="margin-top: 10px;">
                            <label for="notes">Notes</label>
                            <textarea id="notes" name="notes" rows="2" placeholder="Special instructions...">${escapeHtml(repeatOrderDraft?.notes || '')}</textarea>
                        </div>
                        <div id="smart-basket-panel" class="smart-basket-panel"></div>
                        <div id="customer-price-history-panel" class="smart-basket-panel"></div>
                    `
    })}

                ${createCard({
        title: 'Order Items',
        content: `
                        <div style="display: flex; justify-content: space-between; gap: var(--space-3); align-items: center; flex-wrap: wrap; margin-bottom: var(--space-4); padding: var(--space-3); background: var(--color-gray-50); border: 1px solid var(--color-gray-100); border-radius: var(--radius-md);">
                            <div>
                                <label style="display: block; font-weight: 800; color: var(--color-gray-900); margin-bottom: 2px;">Price Type</label>
                                <small style="color: var(--color-gray-500);">Changing this updates non-overridden items in this order.</small>
                            </div>
                            <div id="order-price-mode-selector" style="display: inline-flex; gap: 6px; padding: 4px; background: white; border: 1px solid var(--color-gray-200); border-radius: 8px;">
                                <button type="button" class="btn btn-sm price-mode-btn" data-price-mode="retail">Retail</button>
                                <button type="button" class="btn btn-sm price-mode-btn" data-price-mode="business">Business</button>
                            </div>
                        </div>
                        <div id="items-list" style="display: flex; flex-direction: column; min-height: 100px;"></div>
                        <div style="margin-top: var(--space-4); display: flex; gap: var(--space-3);">
                            <button type="button" id="add-item-btn" class="btn btn-secondary" style="flex: 1; border-style: dashed; background: transparent; color: var(--color-primary-600); font-weight: 600;">
                                + Add Product from Catalog
                            </button>
                            <button type="button" id="add-custom-item-btn" class="btn btn-secondary" style="flex: 1; border-style: dashed; background: transparent; color: var(--color-gray-600); font-weight: 600;">
                                ✍️ Add Custom Item
                            </button>
                        </div>

                        <div style="margin-top: var(--space-6); text-align: right; font-size: var(--text-lg); font-weight: 600;">
                            Total: <span id="total-preview">$0.00</span>
                        </div>
                    `
    })}

                <div style="display: flex; justify-content: flex-end; gap: var(--space-4); margin-top: var(--space-6);">
                    <button type="button" class="btn btn-secondary" onclick="window.history.back()">Cancel</button>
                    <button type="submit" class="btn btn-primary">Create Order</button>
                </div>
            </form>
        </div>
    `;

    const renderItems = () => {
        const list = document.getElementById('items-list');
        if (!list) return;

        if (selectedItems.length === 0) {
            list.innerHTML = `
                <div style="padding: 32px; text-align: center; color: var(--color-gray-400); border: 2px dashed var(--color-gray-100); border-radius: var(--radius-lg);">
                    No items added yet. Click "+ Add Product" to begin.
                </div>
            `;
            updateTotal();
            return;
        }

        list.innerHTML = selectedItems.map((item, index) => `
            <div class="animate-fade-in" style="
                display: grid;
                grid-template-columns: 80px 2fr 90px 110px 140px auto;
                gap: var(--space-4);
                align-items: center;
                padding: var(--space-3);
                background: white;
                border-bottom: 1px solid var(--color-gray-100);
            ">
                <img src="${item.imageUrl || ''}" onerror="this.src='https://placehold.co/80x80?text=📦'"
                     style="width: 60px; height: 60px; border-radius: var(--radius-md); object-fit: cover; background: var(--color-gray-50);">

                <div>
                    <div style="font-weight: 600; color: var(--color-gray-900);">${item.name}</div>
                    <div style="font-size: 12px; color: var(--color-gray-500);">${item.weight || ''}</div>
                    ${item.priceOverridden ? '<span style="display: inline-flex; margin-top: 4px; padding: 2px 6px; border-radius: 999px; background: #fff7ed; color: #9a3412; font-size: 11px; font-weight: 800;">Custom Price</span>' : ''}
                </div>

                <div>
                    <input type="number" class="input qty-input" data-index="${index}" value="${item.quantity}" min="1" style="width: 100%; text-align: center;">
                </div>

                <div style="text-align: right;">
                    <div style="font-weight: 800; color: var(--color-gray-900);">${formatCurrency(item.unitPrice || item.price || 0)}</div>
                    <small style="color: var(--color-gray-500);">${item.priceMode === ORDER_PRICE_MODES.OVERRIDE ? 'Custom' : (item.priceMode === ORDER_PRICE_MODES.BUSINESS ? 'Business' : 'Retail')}</small>
                </div>

                <div style="text-align: right; font-weight: 600;">
                    ${formatCurrency(item.lineSubtotal || ((item.unitPrice || item.price || 0) * item.quantity))}
                </div>

                <div style="display: flex; gap: 6px; justify-content: flex-end; flex-wrap: wrap;">
                    <button type="button" class="btn btn-secondary btn-sm override-item-btn" data-index="${index}">Override</button>
                    ${item.priceOverridden ? '<button type="button" class="btn btn-secondary btn-sm clear-override-btn" data-index="' + index + '">Clear Override</button>' : ''}
                </div>

                <button type="button" class="btn btn-ghost btn-sm remove-item-btn" data-index="${index}" style="color: var(--color-destructive);">
                    🗑️
                </button>
            </div>
        `).join('');

        // Attach listeners
        list.querySelectorAll('.qty-input').forEach(input => {
            input.addEventListener('change', (e) => {
                const idx = parseInt(e.target.dataset.index);
                selectedItems[idx].quantity = parseInt(e.target.value, 10) || 1;
                selectedItems[idx] = normalizeOrderItemPricing(selectedItems[idx]);
                console.info('[PRICING] totals recalculated');
                renderItems();
            });
        });

        list.querySelectorAll('.override-item-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.target.closest('button').dataset.index, 10);
                openOverridePriceModal(idx);
            });
        });

        list.querySelectorAll('.clear-override-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.target.closest('button').dataset.index, 10);
                try {
                    selectedItems[idx] = clearPriceOverrideFromItem(selectedItems[idx]);
                    console.info('[PRICING] item override cleared');
                    notificationService.success('Custom price cleared.');
                    renderItems();
                } catch (error) {
                    notificationService.error(error.message || 'Could not clear override.');
                }
            });
        });

        list.querySelectorAll('.remove-item-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.target.closest('button').dataset.index);
                selectedItems.splice(idx, 1);
                renderItems();
            });
        });

        updateTotal();
    };

    const updateTotal = () => {
        const totals = calculateOrderTotals(selectedItems);
        const el = document.getElementById('total-preview');
        if (el) {
            el.textContent = formatCurrency(totals.totalAmount);
        }
    };

    const normalizeOrderItems = (items = []) => items.map(item => normalizeOrderItemPricing({
        productId: item.productId || '',
        name: item.name || item.productName || item.name_en || 'Product',
        name_en: item.name_en || item.name || item.productName || 'Product',
        name_ru: item.name_ru || '',
        name_kg: item.name_kg || '',
        categoryId: item.categoryId || item.category_id || item.category || '',
        categoryName: item.categoryName || item.category_name || item.category || '',
        unitPrice: Number(item.unitPrice !== undefined ? item.unitPrice : item.price) || 0,
        price: Number(item.unitPrice !== undefined ? item.unitPrice : item.price) || 0,
        quantity: Number(item.quantity) || 1,
        imageUrl: item.imageUrl || '',
        weight: item.weight || '',
        priceMode: item.priceMode || 'retail',
        selectedBasePriceMode: item.selectedBasePriceMode || item.priceMode || 'retail',
        originalRetailPrice: item.originalRetailPrice !== undefined ? item.originalRetailPrice : (item.unitPrice !== undefined ? item.unitPrice : item.price),
        originalBusinessPrice: item.originalBusinessPrice !== undefined ? item.originalBusinessPrice : null,
        priceOverridden: item.priceOverridden === true,
        overridePrice: item.overridePrice !== undefined ? item.overridePrice : null,
        overrideReason: item.overrideReason || '',
        overrideBy: item.overrideBy || null,
        overrideAt: item.overrideAt || null
    }));

    const renderSmartBasketPanel = (customerName, lastItems = []) => {
        const panel = document.getElementById('smart-basket-panel');
        if (!panel) return;

        if (!lastItems.length) {
            panel.classList.remove('active');
            panel.innerHTML = '';
            return;
        }

        const normalizedItems = normalizeOrderItems(lastItems);
        const total = normalizedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        panel.classList.add('active');
        panel.innerHTML = `
            <div style="display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; flex-wrap: wrap;">
                <div>
                    <div style="font-size: 12px; font-weight: 900; color: var(--color-primary-800); text-transform: uppercase;">Usual Basket Found</div>
                    <div style="font-size: 13px; color: var(--color-gray-700); margin-top: 2px;">
                        ${escapeHtml(customerName)} last ordered ${normalizedItems.length} item${normalizedItems.length === 1 ? '' : 's'} · ${formatCurrency(total)}
                    </div>
                </div>
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                    <button type="button" id="apply-usual-basket" class="btn btn-primary btn-sm">Use Basket</button>
                    <button type="button" id="add-usual-basket" class="btn btn-secondary btn-sm">Add Missing</button>
                    <button type="button" id="dismiss-usual-basket" class="btn btn-secondary btn-sm">Ignore</button>
                </div>
            </div>
            <div class="smart-basket-items">
                ${normalizedItems.slice(0, 6).map(item => `
                    <div class="smart-basket-item">
                        <strong style="display: block; font-size: 12px; color: var(--color-gray-900);">${escapeHtml(item.name)}</strong>
                        <span style="display: block; font-size: 11px; color: var(--color-gray-500); margin-top: 2px;">Qty ${item.quantity} · ${formatCurrency(item.price)}</span>
                    </div>
                `).join('')}
            </div>
        `;

        document.getElementById('apply-usual-basket')?.addEventListener('click', () => {
            selectedItems = normalizedItems;
            renderItems();
            panel.classList.remove('active');
            notificationService.success(`Usual basket loaded for ${customerName}.`);
        });

        document.getElementById('add-usual-basket')?.addEventListener('click', () => {
            normalizedItems.forEach(item => {
                const existing = selectedItems.find(entry => entry.productId && entry.productId === item.productId);
                if (existing) {
                    existing.quantity = Number(existing.quantity || 0) + Number(item.quantity || 1);
                    return;
                }
                selectedItems.push(item);
            });
            renderItems();
            panel.classList.remove('active');
            notificationService.success(`Usual basket merged for ${customerName}.`);
        });

        document.getElementById('dismiss-usual-basket')?.addEventListener('click', () => {
            panel.classList.remove('active');
        });
    };

    const buildCustomerPriceHistory = (orders = []) => {
        const productMap = {};
        orders.forEach(order => {
            (order.items || []).forEach(item => {
                const key = item.productId || item.name || item.productName || item.name_en || 'custom';
                const productName = item.name || item.productName || item.name_en || 'Product';
                const price = Number(item.price) || 0;
                const quantity = Number(item.quantity) || 0;
                if (!productMap[key]) {
                    productMap[key] = {
                        productId: item.productId || '',
                        name: productName,
                        name_en: item.name_en || productName,
                        name_ru: item.name_ru || '',
                        name_kg: item.name_kg || '',
                        categoryId: item.categoryId || item.category_id || item.category || '',
                        categoryName: item.categoryName || item.category_name || item.category || '',
                        imageUrl: item.imageUrl || '',
                        weight: item.weight || '',
                        lastPrice: price,
                        lastQuantity: quantity || 1,
                        lastOrderedAt: order.orderDate || order.createdAt || '',
                        totalQuantity: 0,
                        orderCount: 0,
                        prices: []
                    };
                }
                const entry = productMap[key];
                entry.totalQuantity += quantity;
                entry.orderCount += 1;
                entry.prices.push(price);
                if (!entry.lastOrderedAt || new Date(order.orderDate || order.createdAt || 0).getTime() >= new Date(entry.lastOrderedAt || 0).getTime()) {
                    entry.lastPrice = price;
                    entry.lastQuantity = quantity || 1;
                    entry.lastOrderedAt = order.orderDate || order.createdAt || '';
                }
            });
        });

        return Object.values(productMap).map(entry => ({
            ...entry,
            averagePrice: entry.prices.length ? entry.prices.reduce((sum, price) => sum + price, 0) / entry.prices.length : entry.lastPrice
        })).sort((a, b) => b.totalQuantity - a.totalQuantity);
    };

    const renderCustomerPriceHistoryPanel = (customerName, orders = []) => {
        const panel = document.getElementById('customer-price-history-panel');
        if (!panel) return;

        const history = buildCustomerPriceHistory(orders);
        if (!history.length) {
            panel.classList.remove('active');
            panel.innerHTML = '';
            return;
        }

        panel.classList.add('active');
        panel.innerHTML = [
            '<div style="display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; flex-wrap: wrap;">',
            '  <div>',
            '    <div style="font-size: 12px; font-weight: 900; color: var(--color-primary-800); text-transform: uppercase;">Customer Price History</div>',
            '    <div style="font-size: 13px; color: var(--color-gray-700); margin-top: 2px;">' + escapeHtml(customerName) + ' has ' + orders.length + ' recent order' + (orders.length === 1 ? '' : 's') + ' saved on this device.</div>',
            '  </div>',
            '  <button type="button" id="dismiss-price-history" class="btn btn-secondary btn-sm">Hide</button>',
            '</div>',
            '<div style="display: grid; gap: 8px; margin-top: 12px;">',
            history.slice(0, 6).map((item, index) => [
                '<div style="display: grid; grid-template-columns: minmax(0, 1.4fr) repeat(3, auto); gap: 10px; align-items: center; padding: 10px; background: white; border: 1px solid var(--color-gray-100); border-radius: 8px; font-size: 12px;">',
                '  <div style="min-width: 0;">',
                '    <strong style="display: block; color: var(--color-gray-900); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' + escapeHtml(item.name) + '</strong>',
                '    <span style="display: block; color: var(--color-gray-500); margin-top: 2px;">Last: ' + formatDate(item.lastOrderedAt) + ' - Qty ' + item.lastQuantity + '</span>',
                '  </div>',
                '  <span style="font-weight: 900; color: var(--color-primary-700);">' + formatCurrency(item.lastPrice) + '</span>',
                '  <span style="color: var(--color-gray-500);">Avg ' + formatCurrency(item.averagePrice) + '</span>',
                '  <button type="button" class="btn btn-secondary btn-sm add-history-item" data-history-index="' + index + '">Add</button>',
                '</div>'
            ].join('')).join(''),
            '</div>'
        ].join('');

        document.getElementById('dismiss-price-history')?.addEventListener('click', () => {
            panel.classList.remove('active');
        });

        panel.querySelectorAll('.add-history-item').forEach(button => {
            button.addEventListener('click', () => {
                const item = history[Number(button.dataset.historyIndex)];
                if (!item) return;
                const existing = selectedItems.find(entry => entry.productId && item.productId && entry.productId === item.productId);
                if (existing) {
                    existing.price = item.lastPrice;
                    existing.quantity = Number(existing.quantity || 0) + Number(item.lastQuantity || 1);
                } else {
                    selectedItems.push({
                        productId: item.productId,
                        name: item.name,
                        name_en: item.name_en,
                        name_ru: item.name_ru,
                        name_kg: item.name_kg,
                        categoryId: item.categoryId,
                        categoryName: item.categoryName,
                        price: item.lastPrice,
                        quantity: item.lastQuantity || 1,
                        imageUrl: item.imageUrl,
                        weight: item.weight
                    });
                }
                renderItems();
                notificationService.success('Added previous customer item.');
            });
        });
    };

    const getCurrentActorId = () => {
        const user = authService.getCurrentUser();
        return user && user.uid ? user.uid : null;
    };

    const updatePriceModeButtons = () => {
        document.querySelectorAll('.price-mode-btn').forEach(button => {
            const active = button.dataset.priceMode === selectedPriceMode;
            button.classList.toggle('btn-primary', active);
            button.classList.toggle('btn-secondary', !active);
        });
    };

    const switchOrderPriceMode = (mode) => {
        const nextMode = normalizeDefaultOrderPriceMode(mode);
        selectedPriceMode = nextMode;
        const skipped = [];
        selectedItems = selectedItems.map(item => {
            try {
                return repriceOrderItem(item, nextMode);
            } catch (error) {
                skipped.push(item.name || item.productName || 'Product');
                return normalizeOrderItemPricing(item);
            }
        });
        updatePriceModeButtons();
        console.info('[PRICING] create order price mode selected: ' + selectedPriceMode);
        console.info('[PRICING] totals recalculated');
        renderItems();
        if (skipped.length) {
            notificationService.error('Some items do not have a Business Price and were not changed.');
            return;
        }
        notificationService.success('Updated non-overridden items to ' + (nextMode === ORDER_PRICE_MODES.BUSINESS ? 'Business Price.' : 'Retail Price.'));
    };

    const addProductToDraft = (product, mode) => {
        const selectedMode = normalizeDefaultOrderPriceMode(mode || selectedPriceMode);
        try {
            selectedItems.push(buildPricedOrderItemFromProduct(product, selectedMode, 1));
            console.info('[PRICING] product added with priceMode: ' + selectedMode);
            return true;
        } catch (error) {
            if (selectedMode === ORDER_PRICE_MODES.BUSINESS) {
                openMissingBusinessPriceModal(product);
                return false;
            }
            notificationService.error(error.message || 'Product price is not available.');
            return false;
        }
    };

    const openMissingBusinessPriceModal = (product) => {
        const modal = new Modal({
            title: 'Business Price Missing',
            footer: false,
            content: '<p style="margin-bottom: 12px; color: var(--color-gray-700);">This product does not have a Business Price.</p>' +
                '<div style="display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap;">' +
                '<button type="button" class="btn btn-secondary" id="missing-price-cancel">Cancel</button>' +
                '<button type="button" class="btn btn-secondary" id="missing-price-retail">Use Retail Price for this item</button>' +
                '<button type="button" class="btn btn-primary" id="missing-price-override">Enter Override Price</button>' +
                '</div>'
        });
        modal.open();
        document.getElementById('missing-price-cancel').addEventListener('click', function() { modal.close(); });
        document.getElementById('missing-price-retail').addEventListener('click', function() {
            addProductToDraft(product, ORDER_PRICE_MODES.RETAIL);
            modal.close();
            renderItems();
        });
        document.getElementById('missing-price-override').addEventListener('click', function() {
            modal.close();
            const baseItem = buildOrderItemShellForOverride(product);
            selectedItems.push(baseItem);
            openOverridePriceModal(selectedItems.length - 1, { removeOnCancel: true, closeOnBackdrop: false, closeOnEsc: false });
        });
    };

    const buildOrderItemShellForOverride = (product) => {
        const snapshots = snapshotProductPrices(product);
        const retailResult = tryGetProductPriceByMode(product, ORDER_PRICE_MODES.RETAIL);
        const displayName = product.displayName || product.name || product.name_en || 'Product';
        return normalizeOrderItemPricing({
            productId: product.id || product.productId || '',
            name: displayName,
            name_en: product.name_en || displayName,
            name_ru: product.name_ru || '',
            name_kg: product.name_kg || '',
            categoryId: product.categoryId || product.category_id || product.category || '',
            categoryName: product.categoryName || product.category_name || categoryNameById[product.categoryId] || product.category || '',
            quantity: 1,
            imageUrl: product.imageUrl || '',
            weight: product.weight || '',
            unitPrice: retailResult.ok ? retailResult.price : 0,
            price: retailResult.ok ? retailResult.price : 0,
            priceMode: selectedPriceMode,
            selectedBasePriceMode: selectedPriceMode,
            originalRetailPrice: snapshots.originalRetailPrice,
            originalBusinessPrice: snapshots.originalBusinessPrice,
            priceOverridden: false
        });
    };

    const openOverridePriceModal = (index, options = {}) => {
        const item = selectedItems[index];
        if (!item) return;
        let applied = false;
        const modal = new Modal({
            title: 'Override Item Price',
            confirmText: 'Apply Override',
            closeOnBackdrop: options.closeOnBackdrop !== false,
            closeOnEsc: options.closeOnEsc !== false,
            content: [
                '<form id="override-price-form">',
                '<div class="input-group"><label>Product</label><input class="input" value="' + escapeHtml(item.name || item.productName || 'Product') + '" disabled></div>',
                '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">',
                '<div class="input-group"><label>Retail Price</label><input class="input" value="' + formatCurrency(item.originalRetailPrice || 0) + '" disabled></div>',
                '<div class="input-group"><label>Business Price</label><input class="input" value="' + (item.originalBusinessPrice !== null && item.originalBusinessPrice !== undefined ? formatCurrency(item.originalBusinessPrice) : 'Unset') + '" disabled></div>',
                '</div>',
                '<div class="input-group"><label>Current Price</label><input class="input" value="' + formatCurrency(item.unitPrice || item.price || 0) + '" disabled></div>',
                '<div class="input-group"><label>New Unit Price</label><input id="override-unit-price" class="input" type="number" min="0" step="0.01" value="' + (item.overridePrice !== null && item.overridePrice !== undefined ? item.overridePrice : item.unitPrice || item.price || 0) + '" required><small id="override-price-error" style="display: none; color: var(--color-destructive);">Price must be a number greater than or equal to 0.</small></div>',
                '<div class="input-group"><label>Reason, optional</label><textarea id="override-reason" class="input" rows="2">' + escapeHtml(item.overrideReason || '') + '</textarea></div>',
                '</form>'
            ].join(''),
            onConfirm: () => {
                const priceInput = document.getElementById('override-unit-price');
                const errorEl = document.getElementById('override-price-error');
                try {
                    const overridePrice = toFinitePrice(priceInput.value, 'Override Price');
                    selectedItems[index] = applyPriceOverrideToItem(item, overridePrice, document.getElementById('override-reason').value || '', getCurrentActorId(), new Date().toISOString());
                    applied = true;
                    console.info('[PRICING] item override applied');
                    console.info('[PRICING] totals recalculated');
                    renderItems();
                    notificationService.success('Custom price applied.');
                    return true;
                } catch (error) {
                    if (errorEl) errorEl.style.display = 'block';
                    return false;
                }
            }
        });
        modal.open();
        if (options.removeOnCancel && modal.modalEl) {
            const cancelButton = modal.modalEl.querySelector('.cancel-btn');
            if (cancelButton) {
                cancelButton.addEventListener('click', function() {
                    if (!applied && selectedItems[index] === item) {
                        selectedItems.splice(index, 1);
                        renderItems();
                    }
                });
            }
        }
    };

    // Modal Product Picker
    const openProductPicker = () => {
        let activeCategory = 'all';
        let searchQuery = '';

        const modal = new Modal({
            title: 'Select Products',
            size: 'large',
            content: `
                <div style="display: flex; flex-direction: column; gap: var(--space-4); height: 70vh;">
                    <!-- Filter Bar -->
                    <div class="flex-mobile-column" style="display: flex; gap: var(--space-4); align-items: center; padding-bottom: var(--space-4); border-bottom: 1px solid var(--color-gray-200);">
                        <div style="position: relative; flex: 1;">
                            <span style="position: absolute; left: 12px; top: 10px;">🔍</span>
                            <input type="text" id="product-search" class="input" placeholder="Search products..." style="padding-left: 40px; width: 100%;">
                        </div>
                        <select id="category-picker-filter" class="input" style="width: 200px; min-width: 150px;">
                            <option value="all">All Categories</option>
                            ${categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
                        </select>
                    </div>

                    <!-- Product Grid -->
                    <div id="product-grid" class="grid-cols-mobile-2" style="
                        display: grid;
                        grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
                        gap: var(--space-3);
                        overflow-y: auto;
                        padding: 4px;
                    ">
                        <!-- Products rendered here -->
                    </div>
                </div>
            `,
            confirmText: 'Done',
            onConfirm: () => {
                renderItems();
                return true;
            }
        });

        modal.open();

        const grid = document.getElementById('product-grid');
        const searchInput = document.getElementById('product-search');
        const categorySelect = document.getElementById('category-picker-filter');

        const filterAndRender = () => {
            const filtered = products.filter(p => {
                const matchesCat = activeCategory === 'all' || p.categoryId === activeCategory;
                const name = p.displayName || '';
                const matchesSearch = name.toLowerCase().includes(searchQuery.toLowerCase());
                return matchesCat && matchesSearch;
            });

            grid.innerHTML = filtered.map(p => {
                const isSelected = selectedItems.some(item => item.productId === p.id);
                return `
                    <div class="product-card" data-id="${p.id}" style="
                        border: 2px solid ${isSelected ? 'var(--color-primary-500)' : 'var(--color-gray-100)'};
                        border-radius: var(--radius-lg);
                        padding: var(--space-2);
                        cursor: pointer;
                        transition: all var(--transition-fast);
                        background: white;
                        display: flex;
                        flex-direction: column;
                        gap: var(--space-2);
                    ">
                        <img src="${p.imageUrl || ''}" onerror="this.src='https://placehold.co/150x150?text=📦'"
                             style="width: 100%; height: 80px; object-fit: cover; border-radius: var(--radius-md); background: var(--color-gray-50);">
                        <div style="font-weight: 600; font-size: 13px; line-height: 1.2; height: 32px; overflow: hidden; color: var(--color-gray-800);">${p.displayName || 'Unnamed Product'}</div>
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: auto;">
                            <span style="color: ${selectedPriceMode === ORDER_PRICE_MODES.BUSINESS ? 'var(--color-gray-500)' : 'var(--color-primary-600)'}; font-weight: 700; font-size: 12px;">Retail: ${formatCurrency(p.retailPrice || p.price || 0)}</span>
                            <span style="color: ${selectedPriceMode === ORDER_PRICE_MODES.BUSINESS ? 'var(--color-primary-600)' : 'var(--color-gray-500)'}; font-weight: 700; font-size: 12px;">Business: ${p.businessPrice !== null && p.businessPrice !== undefined ? formatCurrency(p.businessPrice) : 'Unset'}</span>
                            ${isSelected ? '<span style="font-size: 14px;">✅</span>' : ''}
                        </div>
                    </div>
                `;
            }).join('');

            // Card Click
            grid.querySelectorAll('.product-card').forEach(card => {
                card.addEventListener('click', () => {
                    const id = card.dataset.id;
                    const p = products.find(prod => prod.id === id);
                    const idx = selectedItems.findIndex(item => item.productId === id);

                    if (idx > -1) {
                        selectedItems.splice(idx, 1);
                    } else {
                        addProductToDraft(p);
                    }
                    filterAndRender();
                });
            });
        };

        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value;
            filterAndRender();
        });

        categorySelect.addEventListener('change', (e) => {
            activeCategory = e.target.value;
            filterAndRender();
        });

        filterAndRender();
    };

    // Custom Item Logic
    document.getElementById('add-custom-item-btn').addEventListener('click', () => {
        const modal = new Modal({
            title: '✍️ Add Custom Item',
            content: `
                <form id="custom-item-form">
                    <div class="input-group">
                        <label>Product Name (English)</label>
                        <input type="text" name="name_en" placeholder="Handcrafted honey..." required>
                    </div>
                    <div class="input-group">
                        <label>Product Name (Russian)</label>
                        <input type="text" name="name_ru" placeholder="Мед ручной работы...">
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                        <div class="input-group">
                            <label>Price (SOM)</label>
                            <input type="number" name="price" value="0" step="0.01" required>
                        </div>
                        <div class="input-group">
                            <label>Weight / Unit</label>
                            <input type="text" name="weight" placeholder="500g">
                        </div>
                    </div>
                </form>
            `,
            onConfirm: () => {
                const form = document.getElementById('custom-item-form');
                if (!form.reportValidity()) return false;

                const data = Object.fromEntries(new FormData(form).entries());
                const price = parseFloat(data.price) || 0;

                selectedItems.push(normalizeOrderItemPricing({
                    productId: 'custom-' + Date.now(),
                    name: data.name_en,
                    name_en: data.name_en,
                    name_ru: data.name_ru || data.name_en,
                    name_kg: '',
                    categoryId: 'custom',
                    categoryName: 'Custom',
                    unitPrice: price,
                    price: price,
                    quantity: 1,
                    imageUrl: '',
                    weight: data.weight || '',
                    priceMode: 'override',
                    selectedBasePriceMode: selectedPriceMode,
                    originalRetailPrice: price,
                    originalBusinessPrice: null,
                    priceOverridden: true,
                    overridePrice: price,
                    overrideReason: 'Custom item',
                    overrideBy: getCurrentActorId(),
                    overrideAt: new Date().toISOString()
                }));

                renderItems();
                return true;
            }
        });
        modal.open();
    });

    // Initial Render Items & Default Date
    setTimeout(() => {
        if (repeatOrderDraft?.items?.length) {
            selectedItems = normalizeOrderItems(repeatOrderDraft.items);
            notificationService.success(`Repeated order loaded for ${repeatOrderDraft.customerName || 'customer'}.`);
        }
        renderItems();
        // Set default date to Tomorrow
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().split('T')[0];
        document.getElementById('orderDate').value = tomorrowStr;
    }, 0);

    updatePriceModeButtons();
    document.querySelectorAll('.price-mode-btn').forEach(button => {
        button.addEventListener('click', (event) => {
            switchOrderPriceMode(event.currentTarget.dataset.priceMode);
        });
    });

    document.getElementById('add-item-btn').addEventListener('click', openProductPicker);


    // Auto-Fill Logic
    const customerInput = document.getElementById('customerName');
    customerInput.addEventListener('change', async (e) => {
        const val = e.target.value;
        if (!val) return;

        const hint = document.getElementById('auto-fill-hint');
        if (hint) hint.textContent = 'Looking for this customer\u2019s usual basket...';
        const [lastItems, historyOrders] = await Promise.all([
            createOrderController.getLastOrderItems(val),
            createOrderController.getCustomerOrderHistory(val, 8)
        ]);
        renderCustomerPriceHistoryPanel(val, historyOrders);
        if (lastItems && lastItems.length > 0) {
            renderSmartBasketPanel(val, lastItems);
            if (hint) hint.textContent = 'Usual basket and customer price history are ready.';
            return;
        }

        renderSmartBasketPanel(val, []);
        if (hint) hint.textContent = historyOrders.length ? 'Customer price history is ready.' : 'No previous basket found. Build this order from the catalog.';
    });

    // Customer Picker Modal
    document.getElementById('select-customer-btn').addEventListener('click', async () => {
        let selectedCategory = 'all';
        let searchQuery = '';

        const modal = new Modal({
            title: t('sidebar_customers'),
            size: 'large',
            content: `
                <div style="display: flex; flex-direction: column; gap: var(--space-4); min-height: 500px;">
                    <div class="flex-mobile-column" style="display: flex; gap: var(--space-3); align-items: center; background: var(--color-gray-50); padding: 12px; border-radius: 8px;">
                        <input type="text" id="modal-cust-search" class="input" placeholder="Search name or phone..." style="flex: 1;">
                        <select id="modal-cust-category" class="input" style="width: 150px; min-width: 120px;">
                            <option value="all">All Categories</option>
                            <option value="A">Category A</option>
                            <option value="B">Category B</option>
                            <option value="C">Category C</option>
                        </select>
                    </div>
                    <div id="modal-customer-table-container" style="flex: 1; overflow-y: auto;"></div>
                </div>
            `,
            footer: false
        });

        modal.open();

        const tableContainer = document.getElementById('modal-customer-table-container');
        if (!customers.length && tableContainer) {
            tableContainer.innerHTML = '<div style="padding: 36px; text-align: center; color: var(--color-gray-500);">Loading saved customers...</div>';
            customers = await customerController.loadAllCustomers();
        }

        const renderTable = () => {
            const filtered = customers.filter(c => {
                const matchesCat = selectedCategory === 'all' || c.category === selectedCategory;
                const matchesQuery = (c.companyName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                    (c.phone || '').includes(searchQuery);
                return matchesCat && matchesQuery;
            });

            const table = new DataTable({
                columns: [
                    {
                        key: 'category',
                        label: 'Cat',
                        render: (val) => `<div style="width: 24px; height: 24px; border-radius: 4px; background: #f0f9ff; color: #0369a1; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 11px;">${val || 'C'}</div>`
                    },
                    { key: 'companyName', label: 'Company', render: (val, row) => `<strong>${val || row.name || 'Unknown'}</strong>` },
                    { key: 'phone', label: 'Phone', render: (val) => val || '-' },
                    { key: 'city', label: 'City', render: (val) => val || '-' }
                ],
                data: filtered,
                onRowClick: (row) => {
                    customerInput.value = row.companyName;
                    customerInput.dispatchEvent(new Event('change')); // Trigger auto-fill logic
                    modal.close();
                }
            });

            const container = document.getElementById('modal-customer-table-container');
            if (!customers.length) {
                container.innerHTML = '<div style="padding: 36px; text-align: center; color: var(--color-gray-500);">No saved customers are available on this device yet. Connect to the internet once to refresh the customer list.</div>';
                return;
            }
            container.innerHTML = table.render();

            // Re-bind row clicks since DataTable might just return string
            document.querySelectorAll('#modal-customer-table-container .data-row').forEach((rowEl, idx) => {
                rowEl.addEventListener('click', () => {
                    const row = filtered[idx];
                    customerInput.value = row.companyName || row.name;
                    customerInput.dispatchEvent(new Event('change'));
                    modal.close();
                });
            });
        };

        document.getElementById('modal-cust-search').addEventListener('input', (e) => {
            searchQuery = e.target.value;
            renderTable();
        });

        document.getElementById('modal-cust-category').addEventListener('change', (e) => {
            selectedCategory = e.target.value;
            renderTable();
        });

        renderTable();
    });

    // Quick Add Customer Logic
    document.getElementById('quick-add-customer-btn').addEventListener('click', () => {
        const modal = new Modal({
            title: 'New Customer',
            confirmText: 'Add Customer',
            content: `
                <form id="quick-add-customer-form">
                    <div class="input-group">
                        <label>Company Name</label>
                        <input type="text" name="companyName" placeholder="Kyrgyz Organics Ltd." required>
                    </div>
                    <div class="input-group">
                        <label>Contact Name</label>
                        <input type="text" name="name" placeholder="John Doe">
                    </div>
                    <div class="input-group">
                        <label>Phone Number</label>
                        <input type="tel" name="phone" placeholder="+996 555 123 456">
                    </div>
                </form>
            `,
            onConfirm: async () => {
                const form = document.getElementById('quick-add-customer-form');
                if (!form.reportValidity()) return false;

                const formData = new FormData(form);
                const data = Object.fromEntries(formData.entries());

                if (!data.name && data.companyName) data.name = data.companyName;

                const success = await customerController.handleCreateCustomer(data);
                if (success) {
                    // Auto-fill the main input
                    const newName = data.companyName || data.name;
                    document.getElementById('customerName').value = newName;

                    // Optionally refresh datalist if needed for future searches,
                    // but for this flow specifically we just want to select it.
                    notificationService.success(t('msg_selected') + newName);
                }
                return success;
            }
        });
        modal.open();
    });


    // Form Submit
    document.getElementById('create-order-form').addEventListener('submit', (e) => {
        e.preventDefault();

        if (selectedItems.length === 0) {
            notificationService.error(t('err_add_product'));
            return;
        }

        const formData = {
            customerName: document.getElementById('customerName').value,
            orderDate: document.getElementById('orderDate').value,
            notes: document.getElementById('notes').value,
            items: selectedItems,
            selectedPriceMode: selectedPriceMode
        };
        createOrderController.handleCreateOrder(formData);
    });
};
