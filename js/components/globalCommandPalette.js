import sessionDataStore from "../services/sessionDataStore.js";
import { customerService } from "../services/customerService.js";
import { productService } from "../services/productService.js";
import { router } from "../router.js";
import { ROUTES } from "../core/constants.js";
import { formatCurrency } from "../core/formatters.js";

var keyboardListenerAttached = false;
var searchRecords = [];

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function createCommandRecords() {
    return [
        { type: 'Command', title: 'Create a new order', subtitle: 'Start an order', route: ROUTES.CREATE_ORDER, keywords: 'new add create order' },
        { type: 'Command', title: 'Open payment collections', subtitle: 'Follow up outstanding balances', route: ROUTES.COLLECTIONS, keywords: 'payment paid overdue collection money' },
        { type: 'Command', title: 'Open production plan', subtitle: 'See demand and shortages', route: ROUTES.PRODUCTION_PLANNER, keywords: 'production bake stock shortage demand' },
        { type: 'Command', title: 'Open delivery and packing', subtitle: 'Prepare today’s delivery run', route: ROUTES.DELIVERY, keywords: 'delivery driver pack packing route' },
        { type: 'Command', title: 'Open invoices', subtitle: 'Browse invoice history', route: ROUTES.INVOICES, keywords: 'invoice print approval' },
        { type: 'Command', title: 'Open inventory', subtitle: 'Review daily stock', route: ROUTES.INVENTORY, keywords: 'stock product inventory' }
    ];
}

function getRecordSearchText(record) {
    return [record.type, record.title, record.subtitle, record.keywords].join(' ').toLowerCase();
}

function addOrderRecords(records, orders) {
    (orders || []).forEach(function(order) {
        records.push({
            type: 'Order',
            title: order.customerName || 'Unnamed order',
            subtitle: (order.status || 'draft') + ' · ' + formatCurrency(order.totalAmount || 0),
            route: ROUTES.ORDER_DETAIL.replace(':id', order.id),
            keywords: [order.id, order.customerName, order.status, order.orderDate].join(' ')
        });
    });
}

function addInvoiceRecords(records, invoices) {
    (invoices || []).forEach(function(invoice) {
        records.push({
            type: 'Invoice',
            title: invoice.invoiceNumber || invoice.customerName || 'Invoice',
            subtitle: (invoice.customerName || 'Unknown customer') + ' · ' + formatCurrency(invoice.totalAmount || invoice.total || 0),
            route: ROUTES.INVOICE_DETAIL.replace(':id', invoice.id),
            keywords: [invoice.id, invoice.invoiceNumber, invoice.customerName, invoice.status].join(' ')
        });
    });
}

function addCustomerRecords(records, customers) {
    (customers || []).forEach(function(customer) {
        records.push({
            type: 'Customer',
            title: customer.companyName || customer.name || 'Customer',
            subtitle: customer.phone || customer.email || 'Customer profile',
            route: ROUTES.CUSTOMER_DETAIL.replace(':id', customer.id),
            keywords: [customer.companyName, customer.name, customer.phone, customer.email, customer.category].join(' ')
        });
    });
}

function addProductRecords(records, products) {
    (products || []).forEach(function(product) {
        records.push({
            type: 'Product',
            title: product.displayName || product.name || 'Product',
            subtitle: formatCurrency(product.price || 0) + ' · Open inventory',
            route: ROUTES.INVENTORY,
            keywords: [product.displayName, product.name, product.id, product.category, product.categoryId].join(' ')
        });
    });
}

async function loadSearchRecords() {
    var results = await Promise.all([
        sessionDataStore.loadOrders({ source: 'global-search' }).catch(function() {
            return { records: [] };
        }),
        sessionDataStore.loadInvoices({ source: 'global-search' }).catch(function() {
            return { records: [] };
        }),
        customerService.getAllCustomers().catch(function() {
            return [];
        }),
        productService.getAllProducts().catch(function() {
            return [];
        })
    ]);
    var records = createCommandRecords();
    addOrderRecords(records, results[0].records || []);
    addInvoiceRecords(records, results[1].records || []);
    addCustomerRecords(records, results[2] || []);
    addProductRecords(records, results[3] || []);
    searchRecords = records;
    return records;
}

function getMatches(query) {
    var normalizedQuery = String(query || '').trim().toLowerCase();
    var records = searchRecords.length ? searchRecords : createCommandRecords();
    if (!normalizedQuery) {
        return records.slice(0, 8);
    }

    var terms = normalizedQuery.split(/\s+/).filter(function(term) {
        return term !== '';
    });
    return records.filter(function(record) {
        var text = getRecordSearchText(record);
        return terms.every(function(term) {
            return text.indexOf(term) !== -1;
        });
    }).slice(0, 12);
}

function renderResults(query) {
    var mount = document.getElementById('command-palette-results');
    if (!mount) {
        return;
    }
    var matches = getMatches(query);
    if (!matches.length) {
        mount.innerHTML = '<div class="command-empty">No matching orders, invoices, customers, products, or commands.</div>';
        return;
    }

    mount.innerHTML = matches.map(function(record, index) {
        return '<button type="button" class="command-result ' + (index === 0 ? 'active' : '') + '" data-command-route="' + escapeHtml(record.route) + '">'
            + '<span class="command-type">' + escapeHtml(record.type) + '</span>'
            + '<span class="command-copy"><strong>' + escapeHtml(record.title) + '</strong><small>' + escapeHtml(record.subtitle) + '</small></span>'
            + '<span class="command-enter">↵</span></button>';
    }).join('');

    mount.querySelectorAll('.command-result').forEach(function(button) {
        button.addEventListener('click', function() {
            closeGlobalCommandPalette();
            router.navigate(button.dataset.commandRoute);
        });
    });
}

function closeGlobalCommandPalette() {
    var overlay = document.getElementById('global-command-overlay');
    if (overlay) {
        overlay.remove();
    }
}

function handlePaletteKeydown(event) {
    var overlay = document.getElementById('global-command-overlay');
    if ((event.ctrlKey || event.metaKey) && String(event.key).toLowerCase() === 'k') {
        event.preventDefault();
        if (overlay) {
            closeGlobalCommandPalette();
        } else {
            openGlobalCommandPalette();
        }
        return;
    }
    if (!overlay) {
        return;
    }
    if (event.key === 'Escape') {
        event.preventDefault();
        closeGlobalCommandPalette();
    }
    if (event.key === 'Enter') {
        var activeResult = overlay.querySelector('.command-result.active');
        if (activeResult) {
            event.preventDefault();
            activeResult.click();
        }
    }
}

export function openGlobalCommandPalette() {
    closeGlobalCommandPalette();
    var overlay = document.createElement('div');
    overlay.id = 'global-command-overlay';
    overlay.className = 'command-overlay';
    overlay.innerHTML = '<section class="command-palette" role="dialog" aria-modal="true" aria-label="Search and commands">'
        + '<div class="command-search-row"><span>⌕</span><input id="global-command-input" type="search" autocomplete="off" placeholder="Search orders, invoices, customers, products, or commands..."><kbd>Esc</kbd></div>'
        + '<div id="command-palette-results" class="command-results"></div>'
        + '<footer><span>Ctrl K to open anywhere</span><span>Enter to select</span></footer></section>';
    document.body.appendChild(overlay);
    overlay.addEventListener('mousedown', function(event) {
        if (event.target === overlay) {
            closeGlobalCommandPalette();
        }
    });
    var input = document.getElementById('global-command-input');
    input.addEventListener('input', function() {
        renderResults(input.value);
    });
    renderResults('');
    input.focus();

    loadSearchRecords().then(function() {
        if (document.getElementById('global-command-input') === input) {
            renderResults(input.value);
        }
    });
}

export function attachGlobalCommandPalette() {
    var searchButton = document.getElementById('global-search-button');
    if (searchButton) {
        searchButton.addEventListener('click', openGlobalCommandPalette);
    }
    if (!keyboardListenerAttached) {
        document.addEventListener('keydown', handlePaletteKeydown);
        keyboardListenerAttached = true;
    }
}