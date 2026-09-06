import { layoutView } from "./layoutView.js";
import { Modal } from "../components/modal.js";
import { LoadingSkeleton } from "../components/loadingSkeleton.js";
import { notificationService } from "../core/notificationService.js";
import { buildPricedOrderItemFromProduct, normalizeDefaultOrderPriceMode } from "../core/pricing.js";
import {
    buildDailyOrderProductColumns,
    getDailyOrderRowQuantities,
    getDailyOrderFilter,
    getLocalDateKey,
    getOrderDateKey,
    getOrdersForDate,
    summarizeDailyOrders
} from "../core/dailyOrders.js";
import { dailyOrdersController } from "../controllers/dailyOrdersController.js";

var ICONS = {
    calendar: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/><path d="m8.5 15 2 2 4-4"/></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    minus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>',
    print: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9V3h12v6"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="7"/><path d="M18 12h.01"/></svg>',
    bread: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M14 52h36c5 0 8-4 7-9l-5-25c-1-6-6-10-12-10H24c-6 0-11 4-12 10L7 43c-1 5 2 9 7 9Z"/><path d="M23 20c2-4 5-6 9-6M30 28c2-4 5-6 9-6M20 38c2-4 5-6 9-6"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>',
    chevronLeft: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
    chevronRight: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>'
};

function escapeHtml(value) {
    return String(value === undefined || value === null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getProductName(item) {
    var source = item || {};
    return source.name || source.displayName || source.productName || 'Product';
}

function formatQuantity(value) {
    var number = Number(value) || 0;
    return Number.isInteger(number) ? String(number) : number.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function formatDateLabel(dateKey) {
    var date = new Date(dateKey + 'T12:00:00');
    if (Number.isNaN(date.getTime())) {
        return dateKey;
    }
    return new Intl.DateTimeFormat('en', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    }).format(date);
}

function shiftDate(dateKey, amount) {
    var date = new Date(dateKey + 'T12:00:00');
    date.setDate(date.getDate() + amount);
    return getLocalDateKey(date);
}

function renderStat(iconClass, value, label) {
    return '<div class="daily-stat-card">'
        + '<span class="daily-stat-icon ' + iconClass + '">' + ICONS[iconClass === 'orders' ? 'calendar' : (iconClass === 'products' ? 'bread' : 'plus')] + '</span>'
        + '<div><strong>' + escapeHtml(formatQuantity(value)) + '</strong><span>' + escapeHtml(label) + '</span></div>'
        + '</div>';
}

function renderFilterBadge(state) {
    var filter = getDailyOrderFilter(state.settings, state.categories);
    var label = 'All products';
    if (filter.usesBreadDefault) {
        label = 'Bread categories';
    } else if (filter.categoryIds.length || filter.productIds.length) {
        label = filter.categoryIds.length + ' categories · ' + filter.productIds.length + ' products';
    }
    return '<span class="daily-filter-badge"><span class="daily-filter-dot"></span>' + escapeHtml(label) + '</span>';
}

function renderEmptyState(state) {
    if (state.orderDataSource === 'unavailable') {
        return '<div class="daily-empty-state daily-orders-unavailable">'
            + '<div class="daily-empty-illustration">' + ICONS.calendar + '</div>'
            + '<h3>Orders could not be loaded</h3>'
            + '<p>Firestore is temporarily unavailable and this device does not have a cached order list yet. Your orders have not been deleted.</p>'
            + '<a href="#/offline" class="btn btn-secondary">Check offline data</a>'
            + '</div>';
    }
    var loadedMessage = state.orders.length > 0
        ? ' ' + state.orders.length + ' total orders are loaded; choose another date to review them.'
        : '';
    return '<div class="daily-empty-state">'
        + '<div class="daily-empty-illustration">' + ICONS.bread + '<span class="daily-empty-spark spark-one"></span><span class="daily-empty-spark spark-two"></span></div>'
        + '<h3>No orders for ' + escapeHtml(formatDateLabel(state.selectedDate)) + '</h3>'
        + '<p>Create an order for this day or choose another date.' + escapeHtml(loadedMessage) + '</p>'
        + '<button type="button" class="btn btn-primary daily-empty-create">' + ICONS.plus + ' Create new order</button>'
        + '</div>';
}

function renderOrderDataNotice(state) {
    if (state.orderDataSource !== 'offline-read-cache' && state.orderDataSource !== 'session-after-error') {
        return '';
    }
    return '<section class="daily-data-notice" role="status">'
        + '<span>' + ICONS.calendar + '</span><div><strong>Showing cached orders</strong>'
        + '<p>Firestore is temporarily unavailable, so Daily Orders is using the latest order list saved on this device.</p></div></section>';
}

function renderOrdersTable(state, visibleOrders) {
    if (!visibleOrders.length) {
        return renderEmptyState(state);
    }

    var productColumns = buildDailyOrderProductColumns(visibleOrders, state.products, state.categories, state.settings);
    var productHeaders = productColumns.map(function(column) {
        return '<th class="daily-product-column"><strong class="daily-column-total">' + escapeHtml(formatQuantity(column.total)) + '</strong>'
            + '<span class="daily-column-name">' + escapeHtml(column.name) + '</span></th>';
    }).join('');
    var rows = visibleOrders.map(function(order) {
        var quantities = getDailyOrderRowQuantities(order, state.products, state.categories, state.settings);
        var status = order.archived === true ? 'archived' : String(order.status || 'draft').replace(/_/g, ' ');
        var quantityCells = productColumns.map(function(column) {
            var quantity = Number(quantities[column.key] || 0);
            return '<td class="daily-product-quantity ' + (quantity > 0 ? 'has-quantity' : 'is-empty') + '">'
                + (quantity > 0 ? '<strong>' + escapeHtml(formatQuantity(quantity)) + '</strong>' : '<span>—</span>') + '</td>';
        }).join('');
        return '<tr>'
            + '<td><button type="button" class="daily-customer-link daily-order-edit" data-order-id="' + escapeHtml(order.id) + '">'
            + '<span class="daily-customer-avatar">' + escapeHtml(String(order.customerName || 'O').charAt(0).toUpperCase()) + '</span>'
            + '<span><strong>' + escapeHtml(order.customerName || 'Unnamed customer') + '</strong><small>Open and edit order</small></span>'
            + '</button></td>'
            + quantityCells
            + '<td><span class="daily-status-badge status-' + escapeHtml(status.replace(/\s/g, '-')) + '"><span></span>' + escapeHtml(status) + '</span></td>'
            + '<td class="daily-row-action"><button type="button" class="daily-icon-button daily-order-edit" data-order-id="' + escapeHtml(order.id) + '" aria-label="Edit order">' + ICONS.chevronRight + '</button></td>'
            + '</tr>';
    }).join('');

    return '<div class="daily-table-wrap"><table class="daily-orders-table">'
        + '<thead><tr><th class="daily-customer-column">Customer</th>' + productHeaders + '<th class="daily-status-column">Status</th><th class="daily-actions-column"><span class="sr-only">Actions</span></th></tr></thead>'
        + '<tbody>' + rows + '</tbody></table></div>';
}

function renderDailyContent(container, state) {
    var visibleOrders = getOrdersForDate(state.orders, state.selectedDate, state.products, state.categories, state.settings);
    visibleOrders.sort(function(first, second) {
        return String(first.customerName || '').localeCompare(String(second.customerName || ''));
    });
    var summary = summarizeDailyOrders(visibleOrders, state.products, state.categories, state.settings);
    var stats = container.querySelector('#daily-order-stats');
    var table = container.querySelector('#daily-orders-content');
    var label = container.querySelector('#daily-selected-label');
    var picker = container.querySelector('#daily-date-picker');
    if (stats) {
        stats.innerHTML = renderStat('orders', summary.orderCount, summary.orderCount === 1 ? 'order' : 'orders')
            + renderStat('products', summary.productCount, summary.productCount === 1 ? 'product' : 'products')
            + renderStat('units', summary.unitCount, 'total units');
    }
    if (table) {
        table.innerHTML = renderOrdersTable(state, visibleOrders);
    }
    if (label) {
        label.textContent = formatDateLabel(state.selectedDate);
    }
    if (picker) {
        picker.value = state.selectedDate;
    }
    attachTableEvents(container, state);
}

function renderPageShell(container, state) {
    container.innerHTML = '<div class="daily-orders-page animate-fade-in">'
        + '<section class="daily-hero">'
        + '<div class="daily-hero-copy"><div class="daily-eyebrow">' + ICONS.bread + '<span>Production-ready order view</span></div>'
        + '<h1>Daily Orders</h1><p>Choose a day, review exactly what needs to be made, and adjust an order without leaving the page.</p>'
        + '<div class="daily-filter-row">' + renderFilterBadge(state) + '<a href="#/settings" class="daily-settings-link">Change filters</a></div></div>'
        + '<button type="button" id="daily-create-order" class="btn btn-primary daily-create-button">' + ICONS.plus + '<span>Create new order</span></button>'
        + '<div class="daily-hero-art" aria-hidden="true">' + ICONS.bread + '<span class="daily-grain grain-one"></span><span class="daily-grain grain-two"></span><span class="daily-grain grain-three"></span></div>'
        + '</section>'
        + renderOrderDataNotice(state)
        + '<section class="daily-date-toolbar">'
        + '<div><span class="daily-toolbar-label">Orders for</span><strong id="daily-selected-label">' + escapeHtml(formatDateLabel(state.selectedDate)) + '</strong></div>'
        + '<div class="daily-date-controls">'
        + '<button type="button" id="daily-prev-day" class="daily-icon-button" aria-label="Previous day">' + ICONS.chevronLeft + '</button>'
        + '<label class="daily-date-input-wrap">' + ICONS.calendar + '<input type="date" id="daily-date-picker" value="' + escapeHtml(state.selectedDate) + '" aria-label="Select daily order date"></label>'
        + '<button type="button" id="daily-today" class="btn btn-secondary">Today</button>'
        + '<button type="button" id="daily-next-day" class="daily-icon-button" aria-label="Next day">' + ICONS.chevronRight + '</button>'
        + '</div></section>'
        + '<section id="daily-order-stats" class="daily-stats"></section>'
        + '<section class="daily-orders-card"><div class="daily-card-heading"><div><span class="daily-card-kicker">Order list</span><h2>Products to prepare</h2></div><span class="daily-table-hint">Click any customer to edit</span></div>'
        + '<div id="daily-orders-content"></div></section>'
        + '<div id="daily-success-animation" class="daily-success-animation" aria-hidden="true"><div>'
        + '<svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="22"/><path d="m16 27 7 7 14-16"/></svg><span>Order saved</span></div></div>'
        + '</div>';
}

function syncEditorDraft(root, draft) {
    var date = root.querySelector('#daily-editor-date');
    var notes = root.querySelector('#daily-editor-notes');
    draft.orderDate = date ? date.value : draft.orderDate;
    draft.notes = notes ? notes.value : draft.notes;
    root.querySelectorAll('[data-daily-quantity]').forEach(function(input) {
        var index = parseInt(input.getAttribute('data-daily-quantity'), 10);
        if (draft.items[index]) {
            draft.items[index].quantity = Math.max(0, Number(input.value) || 0);
        }
    });
}

function addModalCloseButton(modal, label) {
    var shell = modal.modalEl ? modal.modalEl.querySelector('.modal-content') : null;
    if (!shell) {
        return;
    }
    shell.classList.add('daily-modal-shell');
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'daily-modal-close';
    button.setAttribute('aria-label', label || 'Close without saving');
    button.innerHTML = ICONS.close;
    button.addEventListener('click', function() {
        modal.close();
    });
    shell.appendChild(button);
}

function getCustomerName(customer) {
    var source = customer || {};
    return source.companyName || source.name || 'Unnamed customer';
}

function updateCustomerSelection(root, draft) {
    var button = root.querySelector('#daily-editor-customer-button');
    if (!button) {
        return;
    }
    var name = draft.customerName || '';
    button.classList.toggle('has-selection', Boolean(name));
    button.innerHTML = '<span class="daily-customer-avatar">' + escapeHtml((name || 'C').charAt(0).toUpperCase()) + '</span>'
        + '<span class="daily-customer-select-copy"><strong>' + escapeHtml(name || 'Choose a customer') + '</strong>'
        + '<small>' + (name ? 'Click to choose a different customer' : 'Search saved customers by name or phone') + '</small></span>'
        + ICONS.chevronRight;
}

function openCustomerPicker(root, state, draft) {
    syncEditorDraft(root, draft);
    var categories = ['A', 'B', 'C'];
    (Array.isArray(state.customers) ? state.customers : []).forEach(function(customer) {
        var category = String(customer.category || '').trim();
        if (category && categories.indexOf(category) === -1) {
            categories.push(category);
        }
    });
    var categoryOptions = categories.map(function(category) {
        return '<option value="' + escapeHtml(category) + '">Category ' + escapeHtml(category) + '</option>';
    }).join('');
    var modal = new Modal({
        title: 'Choose customer',
        size: 'large',
        footer: false,
        content: '<div class="daily-picker">'
            + '<div class="daily-picker-toolbar"><label class="daily-picker-search">' + ICONS.search + '<input type="search" class="input" id="daily-customer-search" placeholder="Search name or phone…" autocomplete="off"></label>'
            + '<select class="input" id="daily-customer-category" aria-label="Filter customers by category"><option value="all">All categories</option>' + categoryOptions + '</select></div>'
            + '<div class="daily-picker-status" id="daily-customer-status"></div>'
            + '<div class="daily-customer-picker-list" id="daily-customer-results"></div></div>'
    });
    modal.open();
    addModalCloseButton(modal, 'Close customer picker');
    var pickerRoot = modal.modalEl;
    var search = pickerRoot.querySelector('#daily-customer-search');
    var categorySelect = pickerRoot.querySelector('#daily-customer-category');
    var results = pickerRoot.querySelector('#daily-customer-results');
    var status = pickerRoot.querySelector('#daily-customer-status');

    function renderCustomers() {
        var query = String(search.value || '').trim().toLowerCase();
        var category = categorySelect.value;
        var filtered = (Array.isArray(state.customers) ? state.customers : []).filter(function(customer) {
            var haystack = [getCustomerName(customer), customer.phone, customer.city, customer.email].filter(Boolean).join(' ').toLowerCase();
            var matchesCategory = category === 'all' || String(customer.category || '') === category;
            return matchesCategory && (!query || haystack.indexOf(query) !== -1);
        });
        status.textContent = filtered.length + (filtered.length === 1 ? ' customer' : ' customers') + ' found';
        if (!filtered.length) {
            results.innerHTML = '<div class="daily-picker-empty">' + ICONS.search + '<strong>No customers found</strong><span>Try another name, phone number, or category.</span></div>';
            return;
        }
        results.innerHTML = filtered.map(function(customer, index) {
            var name = getCustomerName(customer);
            return '<button type="button" class="daily-customer-picker-card" data-customer-index="' + index + '">'
                + '<span class="daily-customer-avatar">' + escapeHtml(name.charAt(0).toUpperCase()) + '</span>'
                + '<span><strong>' + escapeHtml(name) + '</strong><small>' + escapeHtml(customer.phone || 'No phone number') + (customer.city ? ' · ' + escapeHtml(customer.city) : '') + '</small></span>'
                + '<em>' + escapeHtml(customer.category || 'C') + '</em>' + ICONS.chevronRight + '</button>';
        }).join('');
        results.querySelectorAll('[data-customer-index]').forEach(function(button) {
            button.addEventListener('click', function() {
                var customer = filtered[parseInt(button.getAttribute('data-customer-index'), 10)];
                if (!customer) {
                    return;
                }
                draft.customerId = customer.id || '';
                draft.customerName = getCustomerName(customer);
                updateCustomerSelection(root, draft);
                modal.close();
            });
        });
    }

    search.addEventListener('input', renderCustomers);
    categorySelect.addEventListener('change', renderCustomers);
    renderCustomers();
    search.focus();
}

function getProductCategoryId(product) {
    var source = product || {};
    return String(source.categoryId || source.category_id || source.category || '');
}

function addProductToDraft(product, state, draft) {
    var priceMode = normalizeDefaultOrderPriceMode(draft.selectedPriceMode || state.settings.defaultOrderPriceMode);
    try {
        draft.items.push(buildPricedOrderItemFromProduct(product, priceMode, 1));
    } catch (error) {
        draft.items.push(buildPricedOrderItemFromProduct(product, 'retail', 1));
    }
}

function openProductPicker(root, state, draft, editorState) {
    syncEditorDraft(root, draft);
    var categoryOptions = (Array.isArray(state.categories) ? state.categories : []).map(function(category) {
        return '<option value="' + escapeHtml(category.id) + '">' + escapeHtml(category.name || category.displayName || 'Category') + '</option>';
    }).join('');
    var modal = new Modal({
        title: 'Choose product to add',
        size: 'large',
        footer: false,
        content: '<div class="daily-picker">'
            + '<div class="daily-picker-toolbar"><label class="daily-picker-search">' + ICONS.search + '<input type="search" class="input" id="daily-product-search" placeholder="Search products…" autocomplete="off"></label>'
            + '<select class="input" id="daily-product-category" aria-label="Filter products by category"><option value="all">All categories</option>' + categoryOptions + '</select></div>'
            + '<div class="daily-picker-status" id="daily-product-status"></div>'
            + '<div class="daily-product-picker-grid" id="daily-product-results"></div></div>'
    });
    modal.open();
    addModalCloseButton(modal, 'Close product picker');
    var pickerRoot = modal.modalEl;
    var search = pickerRoot.querySelector('#daily-product-search');
    var categorySelect = pickerRoot.querySelector('#daily-product-category');
    var results = pickerRoot.querySelector('#daily-product-results');
    var status = pickerRoot.querySelector('#daily-product-status');

    function renderProducts() {
        var query = String(search.value || '').trim().toLowerCase();
        var category = categorySelect.value;
        var selectedIds = draft.items.map(function(item) { return String(item.productId || item.id || ''); });
        var filtered = (Array.isArray(state.products) ? state.products : []).filter(function(product) {
            var haystack = [product.displayName, product.name, product.name_en, product.name_ru, product.name_kg, product.sku].filter(Boolean).join(' ').toLowerCase();
            var matchesCategory = category === 'all' || getProductCategoryId(product) === category;
            return matchesCategory && (!query || haystack.indexOf(query) !== -1);
        });
        status.textContent = filtered.length + (filtered.length === 1 ? ' product' : ' products') + ' found';
        if (!filtered.length) {
            results.innerHTML = '<div class="daily-picker-empty">' + ICONS.search + '<strong>No products found</strong><span>Try another product name or category.</span></div>';
            return;
        }
        results.innerHTML = filtered.map(function(product, index) {
            var selected = selectedIds.indexOf(String(product.id || '')) !== -1;
            var image = product.imageUrl
                ? '<img src="' + escapeHtml(product.imageUrl) + '" alt="" loading="lazy">'
                : '<span class="daily-product-picker-icon">' + ICONS.bread + '</span>';
            return '<button type="button" class="daily-product-picker-card ' + (selected ? 'is-selected' : '') + '" data-product-index="' + index + '" ' + (selected ? 'disabled' : '') + '>'
                + image + '<span><strong>' + escapeHtml(product.displayName || product.name || 'Product') + '</strong><small>' + (selected ? 'Already in order' : 'Click to add with Qty 1') + '</small></span>'
                + (selected ? '<em>Added</em>' : ICONS.plus) + '</button>';
        }).join('');
        results.querySelectorAll('[data-product-index]:not([disabled])').forEach(function(button) {
            button.addEventListener('click', function() {
                var product = filtered[parseInt(button.getAttribute('data-product-index'), 10)];
                if (!product) {
                    return;
                }
                addProductToDraft(product, state, draft);
                modal.close();
                renderEditorItems(root, state, draft, editorState);
            });
        });
    }

    search.addEventListener('input', renderProducts);
    categorySelect.addEventListener('change', renderProducts);
    renderProducts();
    search.focus();
}

function renderEditorItems(root, state, draft, editorState) {
    var mount = root.querySelector('#daily-editor-items');
    if (!mount) {
        return;
    }
    var itemRows = draft.items.map(function(item, index) {
        return '<div class="daily-editor-item animate-daily-item-in">'
            + '<div class="daily-editor-product"><span class="daily-editor-product-icon">' + ICONS.bread + '</span><div><strong>' + escapeHtml(getProductName(item)) + '</strong><small>Quantity for this order</small></div></div>'
            + '<div class="daily-quantity-control"><button type="button" class="daily-qty-step" data-step-index="' + index + '" data-step-amount="-1" aria-label="Decrease quantity">' + ICONS.minus + '</button>'
            + '<input type="number" min="0" step="1" value="' + escapeHtml(formatQuantity(item.quantity)) + '" data-daily-quantity="' + index + '" aria-label="Quantity for ' + escapeHtml(getProductName(item)) + '">'
            + '<button type="button" class="daily-qty-step is-plus" data-step-index="' + index + '" data-step-amount="1" aria-label="Increase quantity">' + ICONS.plus + '</button></div>'
            + '<button type="button" class="daily-remove-product" data-remove-index="' + index + '" aria-label="Remove ' + escapeHtml(getProductName(item)) + '">' + ICONS.minus + '<span>Remove</span></button>'
            + '</div>';
    }).join('');

    mount.innerHTML = itemRows
        + (!draft.items.length ? '<div class="daily-editor-empty">' + ICONS.bread + '<div><strong>No products yet</strong><span>Use the plus button below to build this order.</span></div></div>' : '')
        + '<div class="daily-add-product-area">'
        + '<button type="button" id="daily-open-product-picker" class="daily-add-product-button">' + ICONS.plus + '<span>Add a new product</span></button></div>';

    attachEditorItemEvents(root, state, draft, editorState);
}

function attachEditorItemEvents(root, state, draft, editorState) {
    root.querySelectorAll('[data-remove-index]').forEach(function(button) {
        button.addEventListener('click', function() {
            syncEditorDraft(root, draft);
            draft.items.splice(parseInt(button.getAttribute('data-remove-index'), 10), 1);
            renderEditorItems(root, state, draft, editorState);
        });
    });
    root.querySelectorAll('[data-step-index]').forEach(function(button) {
        button.addEventListener('click', function() {
            syncEditorDraft(root, draft);
            var index = parseInt(button.getAttribute('data-step-index'), 10);
            var amount = parseInt(button.getAttribute('data-step-amount'), 10);
            if (!draft.items[index]) {
                return;
            }
            draft.items[index].quantity = Math.max(0, Number(draft.items[index].quantity || 0) + amount);
            if (draft.items[index].quantity === 0) {
                draft.items.splice(index, 1);
            }
            renderEditorItems(root, state, draft, editorState);
        });
    });
    root.querySelectorAll('[data-daily-quantity]').forEach(function(input) {
        input.addEventListener('change', function() {
            syncEditorDraft(root, draft);
            draft.items = draft.items.filter(function(item) {
                return Number(item.quantity) > 0;
            });
            renderEditorItems(root, state, draft, editorState);
        });
    });
    var addButton = root.querySelector('#daily-open-product-picker');
    if (addButton) {
        addButton.addEventListener('click', function() {
            openProductPicker(root, state, draft, editorState);
        });
    }
}

function renderPrintSlip(order, settings) {
    var items = Array.isArray(order.items) ? order.items : [];
    var rows = items.map(function(item, index) {
        return '<tr><td>' + (index + 1) + '</td><td>' + escapeHtml(getProductName(item)) + '</td><td>' + escapeHtml(formatQuantity(item.quantity)) + '</td></tr>';
    }).join('');
    return '<section class="order-slip"><header><div><span>KYRGYZ ORGANICS</span><h1>Daily order</h1></div><div class="date-box"><small>ORDER DATE</small><strong>' + escapeHtml(formatDateLabel(order.orderDate)) + '</strong></div></header>'
        + '<div class="customer"><small>CUSTOMER / COMPANY</small><strong>' + escapeHtml(order.customerName) + '</strong></div>'
        + '<table><thead><tr><th>#</th><th>Product</th><th>Qty</th></tr></thead><tbody>' + rows + '</tbody></table>'
        + (order.notes ? '<div class="notes"><small>NOTES</small><p>' + escapeHtml(order.notes) + '</p></div>' : '')
        + '<footer><span>' + escapeHtml(settings.companyName || 'Kyrgyz Organics') + '</span><span>Prepared: ' + escapeHtml(new Date().toLocaleString()) + '</span></footer></section>';
}

function getPrintDocument(order, settings, mode) {
    var slip = renderPrintSlip(order, settings);
    var twoUp = mode === 'two-up';
    return '<!doctype html><html><head><meta charset="utf-8"><title>Daily Order - ' + escapeHtml(order.customerName) + '</title><style>'
        + '@page{size:A4 portrait;margin:9mm}*{box-sizing:border-box}body{margin:0;color:#1f2a22;font-family:Arial,sans-serif;background:#fff}'
        + '.sheet{display:' + (twoUp ? 'grid' : 'block') + ';grid-template-rows:' + (twoUp ? '1fr 1fr' : '1fr') + ';height:279mm;gap:' + (twoUp ? '7mm' : '0') + '}'
        + '.order-slip{border:1.5px solid #1f7a3d;border-radius:10px;padding:' + (twoUp ? '8mm' : '13mm') + ';overflow:hidden;position:relative}'
        + 'header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #1f7a3d;padding-bottom:12px;margin-bottom:14px}header span,small{font-size:9px;letter-spacing:.12em;font-weight:800;color:#667267}h1{font-size:' + (twoUp ? '22px' : '30px') + ';margin:4px 0 0}.date-box{text-align:right;max-width:55%}.date-box strong{display:block;margin-top:5px;font-size:' + (twoUp ? '12px' : '15px') + '}.customer{display:grid;gap:4px;margin-bottom:12px}.customer strong{font-size:' + (twoUp ? '15px' : '19px') + '}'
        + 'table{width:100%;border-collapse:collapse;font-size:' + (twoUp ? '11px' : '14px') + '}th{background:#eef8ef;text-align:left;color:#195f33}th,td{padding:' + (twoUp ? '5px 7px' : '8px 10px') + ';border-bottom:1px solid #d8e3d8}th:first-child,td:first-child{width:9%}th:last-child,td:last-child{width:16%;text-align:center;font-weight:800}.notes{margin-top:12px;background:#fffaf0;border-radius:6px;padding:8px}.notes p{font-size:11px;margin:4px 0 0}footer{position:absolute;left:' + (twoUp ? '8mm' : '13mm') + ';right:' + (twoUp ? '8mm' : '13mm') + ';bottom:' + (twoUp ? '6mm' : '9mm') + ';display:flex;justify-content:space-between;border-top:1px solid #d8e3d8;padding-top:6px;font-size:8px;color:#667267}'
        + '@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><main class="sheet">' + slip + (twoUp ? slip : '') + '</main>'
        + '<script>window.addEventListener("load",function(){setTimeout(function(){window.print();},250);});<\/script></body></html>';
}

function openPrintWindow() {
    var printWindow = window.open('', '_blank', 'width=900,height=1000');
    if (printWindow) {
        printWindow.document.write('<!doctype html><title>Preparing order</title><body style="font-family:Arial;padding:40px;color:#195f33">Saving order and preparing print layout…</body>');
        printWindow.document.close();
    }
    return printWindow;
}

function showSavedAnimation(container) {
    var element = container.querySelector('#daily-success-animation');
    if (!element) {
        return;
    }
    element.classList.remove('is-visible');
    window.requestAnimationFrame(function() {
        element.classList.add('is-visible');
        window.setTimeout(function() { element.classList.remove('is-visible'); }, 1650);
    });
}

function openOrderEditor(container, state, sourceOrder) {
    var source = sourceOrder || {};
    var draft = {
        orderId: source.id || '',
        customerId: source.customerId || '',
        customerName: source.customerName || '',
        orderDate: getOrderDateKey(source) || state.selectedDate,
        notes: source.notes || '',
        selectedPriceMode: source.selectedPriceMode || state.settings.defaultOrderPriceMode || 'retail',
        status: source.status || 'draft',
        items: (Array.isArray(source.items) ? source.items : []).map(function(item) {
            return Object.assign({}, item);
        })
    };
    var editorState = { saving: false };
    var content = '<div class="daily-editor">'
        + '<div class="daily-editor-actions">'
        + '<button type="button" class="btn btn-secondary" data-save-mode="save"><span class="daily-save-icon">' + ICONS.calendar + '</span>Save order</button>'
        + '<button type="button" class="btn btn-primary" data-save-mode="portrait">' + ICONS.print + '<span>Save order and print<br><small>Portrait</small></span></button>'
        + '<button type="button" class="btn btn-primary daily-two-up-button" data-save-mode="two-up">' + ICONS.print + '<span>Save order and print<br><small>2-up portrait</small></span></button>'
        + '</div>'
        + '<div class="daily-editor-date-row"><div><span class="daily-card-kicker">Order date</span><div class="daily-date-choice"><button type="button" id="daily-editor-today" class="btn btn-secondary">Today</button><button type="button" id="daily-editor-custom" class="btn btn-secondary">Custom date</button></div></div>'
        + '<label><span>Selected date</span><input type="date" class="input" id="daily-editor-date" value="' + escapeHtml(draft.orderDate) + '"></label></div>'
        + '<div class="daily-editor-field-grid"><div class="daily-editor-field"><span>Customer / Company</span><button type="button" id="daily-editor-customer-button" class="daily-customer-select-button"></button></div>'
        + '<label><span>Notes</span><input type="text" class="input" id="daily-editor-notes" value="' + escapeHtml(draft.notes) + '" placeholder="Optional instructions"></label></div>'
        + '<div class="daily-editor-section-heading"><div><span class="daily-card-kicker">Products</span><h4>Order quantities</h4></div><span>Qty 0 removes a product</span></div>'
        + '<div id="daily-editor-items"></div></div>';
    var modal = new Modal({
        title: sourceOrder ? 'Edit daily order' : 'Create new order',
        content: content,
        size: 'large',
        footer: false,
        closeOnBackdrop: false
    });
    modal.open();
    var root = modal.modalEl;
    addModalCloseButton(modal, 'Close without saving');
    updateCustomerSelection(root, draft);
    renderEditorItems(root, state, draft, editorState);

    var todayButton = root.querySelector('#daily-editor-today');
    var customButton = root.querySelector('#daily-editor-custom');
    var customerButton = root.querySelector('#daily-editor-customer-button');
    if (customerButton) {
        customerButton.addEventListener('click', function() {
            openCustomerPicker(root, state, draft);
        });
    }
    if (todayButton) {
        todayButton.addEventListener('click', function() {
            var input = root.querySelector('#daily-editor-date');
            if (input) input.value = getLocalDateKey(new Date());
        });
    }
    if (customButton) {
        customButton.addEventListener('click', function() {
            var input = root.querySelector('#daily-editor-date');
            if (input) input.focus();
        });
    }
    root.querySelectorAll('[data-save-mode]').forEach(function(button) {
        button.addEventListener('click', async function() {
            if (editorState.saving) {
                return;
            }
            syncEditorDraft(root, draft);
            draft.items = draft.items.filter(function(item) { return Number(item.quantity) > 0; });
            if (!draft.customerName) {
                notificationService.error('Choose a customer or company.');
                return;
            }
            if (!draft.orderDate) {
                notificationService.error('Choose an order date.');
                return;
            }
            if (!draft.items.length) {
                notificationService.error('Add at least one product with a quantity above zero.');
                return;
            }

            var mode = button.getAttribute('data-save-mode');
            var printWindow = mode === 'save' ? null : openPrintWindow();
            editorState.saving = true;
            root.querySelectorAll('[data-save-mode]').forEach(function(action) { action.disabled = true; });
            button.classList.add('is-saving');
            try {
                var savedOrder = await dailyOrdersController.saveOrder(draft);
                if (printWindow) {
                    printWindow.document.open();
                    printWindow.document.write(getPrintDocument(savedOrder, state.settings, mode));
                    printWindow.document.close();
                } else if (mode !== 'save') {
                    notificationService.info('Order saved. Allow pop-ups to print this order.');
                }
                state.orders = state.orders.filter(function(order) {
                    return String(order && order.id) !== String(savedOrder.id);
                });
                state.orders.push(savedOrder);
                state.selectedDate = savedOrder.orderDate;
                modal.close();
                renderDailyContent(container, state);
                showSavedAnimation(container);
            } catch (error) {
                if (printWindow) printWindow.close();
                notificationService.error(error && error.message ? error.message : 'The order could not be saved.');
                editorState.saving = false;
                root.querySelectorAll('[data-save-mode]').forEach(function(action) { action.disabled = false; });
                button.classList.remove('is-saving');
            }
        });
    });
}

function attachTableEvents(container, state) {
    container.querySelectorAll('.daily-order-edit').forEach(function(button) {
        button.addEventListener('click', function() {
            var orderId = button.getAttribute('data-order-id');
            var order = state.orders.find(function(candidate) { return String(candidate.id) === String(orderId); });
            if (order) openOrderEditor(container, state, order);
        });
    });
    var emptyCreate = container.querySelector('.daily-empty-create');
    if (emptyCreate) {
        emptyCreate.addEventListener('click', function() { openOrderEditor(container, state, null); });
    }
}

function attachPageEvents(container, state) {
    var createButton = container.querySelector('#daily-create-order');
    var previousButton = container.querySelector('#daily-prev-day');
    var nextButton = container.querySelector('#daily-next-day');
    var todayButton = container.querySelector('#daily-today');
    var picker = container.querySelector('#daily-date-picker');
    if (createButton) createButton.addEventListener('click', function() { openOrderEditor(container, state, null); });
    if (previousButton) previousButton.addEventListener('click', function() { state.selectedDate = shiftDate(state.selectedDate, -1); renderDailyContent(container, state); });
    if (nextButton) nextButton.addEventListener('click', function() { state.selectedDate = shiftDate(state.selectedDate, 1); renderDailyContent(container, state); });
    if (todayButton) todayButton.addEventListener('click', function() { state.selectedDate = getLocalDateKey(new Date()); renderDailyContent(container, state); });
    if (picker) picker.addEventListener('change', function() { if (picker.value) { state.selectedDate = picker.value; renderDailyContent(container, state); } });
}

export async function renderDailyOrders() {
    layoutView.render('route-change');
    layoutView.updateTitle('Daily Orders');
    var container = document.getElementById('page-container');
    container.innerHTML = LoadingSkeleton();
    var workspace = await dailyOrdersController.loadWorkspace();
    var state = Object.assign({}, workspace, {
        selectedDate: getLocalDateKey(new Date())
    });
    renderPageShell(container, state);
    attachPageEvents(container, state);
    renderDailyContent(container, state);
}
