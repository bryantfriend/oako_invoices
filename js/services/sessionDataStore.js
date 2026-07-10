import { auth } from "../core/firebase.js";
import { store } from "../core/store.js";
import icfPipeline from "../ICF/engine/pipeline.js";
import loadOrdersIntentModule from "../ICF/Intents/LoadOrdersIntent.js";
import refreshOrdersIntentModule from "../ICF/Intents/RefreshOrdersIntent.js";
import invalidateOrdersCacheIntentModule from "../ICF/Intents/InvalidateOrdersCacheIntent.js";
import loadInvoicesIntentModule from "../ICF/Intents/LoadInvoicesIntent.js";
import refreshInvoicesIntentModule from "../ICF/Intents/RefreshInvoicesIntent.js";
import invalidateInvoicesCacheIntentModule from "../ICF/Intents/InvalidateInvoicesCacheIntent.js";
import { orderService } from "./orderService.js";
import { invoiceService } from "./invoiceService.js";
import { customerService } from "./customerService.js";
import { productService } from "./productService.js";
import { settingsService } from "./settingsService.js";
import { openOfflineDexieDatabase } from "./offlineDexieDb.js";
import { runSingleFlight } from "../core/singleFlight.js";
import { readCachedRowsAsync } from "../core/firestoreRead.js";

var SESSION_REFRESH_AGE_MS = 20000;
var SESSION_CACHE_SCHEMA = 'session-v1';

var sessionDataStore = {
    orders: createCollectionState('orders'),
    invoices: createCollectionState('invoices'),
    archivedInvoices: createCollectionState('archivedInvoices')
};

function createCollectionState(name) {
    return {
        name: name,
        records: [],
        loaded: false,
        loadedAt: null,
        loadingPromise: null,
        revision: 0,
        ownerKey: '',
        extras: {},
        lastError: null,
        lastMutationAt: 0,
        lastReadCount: 0,
        lastInvalidationReason: ''
    };
}

function getCurrentOwnerKey() {
    var user = auth.currentUser;
    if (!user) {
        return 'anonymous';
    }

    return user.uid || user.email || 'anonymous';
}

function getCurrentActor() {
    var user = auth.currentUser;
    var state = store.getState();
    var profile = state.adminProfile || {};

    if (!user) {
        return {
            id: 'anonymous',
            role: 'anonymous'
        };
    }

    return {
        id: user.email || user.uid || 'admin',
        role: profile.role || 'admin'
    };
}

function ensureOwner() {
    var ownerKey = getCurrentOwnerKey();
    var keys = Object.keys(sessionDataStore);
    var index = 0;

    while (index < keys.length) {
        var state = sessionDataStore[keys[index]];
        if (state.ownerKey && state.ownerKey !== ownerKey) {
            resetCollectionState(state, 'auth-owner-changed');
        }
        state.ownerKey = ownerKey;
        index = index + 1;
    }

    return ownerKey;
}

function resetCollectionState(state, reason) {
    state.records = [];
    state.loaded = false;
    state.loadedAt = null;
    state.loadingPromise = null;
    state.revision = state.revision + 1;
    state.extras = {};
    state.lastError = null;
    state.lastReadCount = 0;
    state.lastInvalidationReason = reason || '';
}

function cloneRecord(record) {
    return Object.assign({}, record || {});
}

function cloneRecords(records) {
    var list = Array.isArray(records) ? records : [];
    var cloned = [];
    var index = 0;

    while (index < list.length) {
        cloned.push(cloneRecord(list[index]));
        index = index + 1;
    }

    return cloned;
}

function cloneExtras(extras) {
    var source = extras || {};
    return Object.assign({}, source);
}

function getCacheKey(collectionName, ownerKey) {
    return SESSION_CACHE_SCHEMA + ':' + ownerKey + ':' + collectionName;
}

function getPerformanceNow() {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
        return performance.now();
    }

    return Date.now();
}

function logPerf(label, startedAt) {
    var duration = getPerformanceNow() - startedAt;
    console.info('[PERF] ' + label + ': ' + duration.toFixed(1) + ' ms');
    return duration;
}

function logCache(collectionLabel, message, details) {
    console.info('[PERF] ' + collectionLabel + ' ' + message, details || {});
}

function recordsAreEqual(currentRecords, nextRecords, currentExtras, nextExtras) {
    try {
        return JSON.stringify({ records: currentRecords || [], extras: currentExtras || {} }) ===
            JSON.stringify({ records: nextRecords || [], extras: nextExtras || {} });
    } catch (error) {
        return false;
    }
}

function getMillis(value) {
    if (!value) {
        return 0;
    }

    if (typeof value.toMillis === 'function') {
        return value.toMillis();
    }

    if (typeof value.toDate === 'function') {
        return value.toDate().getTime();
    }

    if (value.seconds) {
        return value.seconds * 1000;
    }

    var date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return 0;
    }

    return date.getTime();
}

function getRecordFreshness(record) {
    var source = record || {};
    return Math.max(
        getMillis(source.updatedAt),
        getMillis(source.localUpdatedAt),
        getMillis(source.createdAt),
        getMillis(source.archivedAt),
        0
    );
}

function mergeRecordsByFreshness(existingRecords, incomingRecords) {
    var byId = {};
    var index = 0;

    while (index < existingRecords.length) {
        var existing = existingRecords[index];
        if (existing && existing.id) {
            byId[existing.id] = existing;
        }
        index = index + 1;
    }

    index = 0;
    while (index < incomingRecords.length) {
        var incoming = incomingRecords[index];
        if (incoming && incoming.id) {
            var current = byId[incoming.id];
            if (!current || getRecordFreshness(incoming) >= getRecordFreshness(current)) {
                byId[incoming.id] = incoming;
            }
        }
        index = index + 1;
    }

    return Object.keys(byId).map(function(id) {
        return byId[id];
    });
}

async function readDexieCache(collectionName) {
    var ownerKey = getCurrentOwnerKey();
    var cacheKey = getCacheKey(collectionName, ownerKey);

    try {
        var database = await openOfflineDexieDatabase();
        if (!database.sessionRecords) {
            return null;
        }

        var record = await database.sessionRecords.get(cacheKey);
        if (!record || !record.rowsJson) {
            return null;
        }

        return {
            records: JSON.parse(record.rowsJson),
            extras: record.extrasJson ? JSON.parse(record.extrasJson) : {},
            loadedAt: record.loadedAt || null,
            source: 'dexie'
        };
    } catch (error) {
        console.warn('[PERF] Dexie session cache read failed.', {
            collectionName: collectionName,
            message: error && error.message ? error.message : ''
        });
        return null;
    }
}

async function writeDexieCache(collectionName, records, extras) {
    var ownerKey = getCurrentOwnerKey();
    var cacheKey = getCacheKey(collectionName, ownerKey);

    try {
        var database = await openOfflineDexieDatabase();
        if (!database.sessionRecords) {
            return false;
        }

        await database.sessionRecords.put({
            cacheKey: cacheKey,
            ownerKey: ownerKey,
            collectionName: collectionName,
            rowsJson: JSON.stringify(records || []),
            extrasJson: JSON.stringify(extras || {}),
            loadedAt: new Date().toISOString()
        });
        return true;
    } catch (error) {
        console.warn('[PERF] Dexie session cache write failed.', {
            collectionName: collectionName,
            message: error && error.message ? error.message : ''
        });
        return false;
    }
}

async function deleteDexieCache(collectionName) {
    var ownerKey = getCurrentOwnerKey();
    var cacheKey = getCacheKey(collectionName, ownerKey);

    try {
        var database = await openOfflineDexieDatabase();
        if (database.sessionRecords) {
            await database.sessionRecords.delete(cacheKey);
        }
    } catch (error) {
        console.warn('[PERF] Dexie session cache delete failed.', {
            collectionName: collectionName,
            message: error && error.message ? error.message : ''
        });
    }
}

function getSnapshot(collectionName) {
    ensureOwner();
    var state = sessionDataStore[collectionName];
    if (!state || !state.loaded) {
        return null;
    }

    return {
        records: cloneRecords(state.records),
        extras: cloneExtras(state.extras),
        loadedAt: state.loadedAt,
        revision: state.revision,
        source: 'memory',
        shouldRefresh: isStale(state)
    };
}

function isStale(state) {
    if (!state || !state.loadedAt) {
        return true;
    }

    return Date.now() - state.loadedAt > SESSION_REFRESH_AGE_MS;
}

function assignCollectionData(state, records, extras, readCount, reason) {
    var safeRecords = cloneRecords(records);
    var safeExtras = cloneExtras(extras);
    var changed = !recordsAreEqual(state.records, safeRecords, state.extras, safeExtras);

    state.records = safeRecords;
    state.loaded = true;
    state.loadedAt = Date.now();
    state.extras = safeExtras;
    state.lastError = null;
    state.lastReadCount = Number(readCount) || 0;

    if (changed) {
        state.revision = state.revision + 1;
    }

    writeDexieCache(state.name, state.records, state.extras);

    return {
        changed: changed,
        reason: reason || '',
        revision: state.revision
    };
}

async function fetchOrdersData() {
    var startedAt = getPerformanceNow();
    var queryCount = 3;
    var referenceGroupsPromise = Promise.all([
        readCachedRowsAsync('products:all').catch(function() { return []; }),
        readCachedRowsAsync('categories:all').catch(function() { return []; })
    ]);
    var groups = await Promise.all([
        orderService.getAllOrders(),
        customerService.getAllCustomers(),
        invoiceService.getReturnedInvoicesForAnalytics(),
        referenceGroupsPromise
    ]);
    var orders = groups[0] || [];
    var customers = groups[1] || [];
    var returnInvoices = groups[2] || [];
    var referenceGroups = groups[3] || [];
    var products = referenceGroups[0] || [];
    var productCategories = referenceGroups[1] || [];
    var enrichedOrders = buildOrdersWithContext(orders, customers, products, productCategories, returnInvoices);

    logPerf('Orders Firestore refresh', startedAt);
    logCache('Orders', 'Firestore queries initiated by view', {
        queries: queryCount,
        records: enrichedOrders.length,
        cachedProducts: products.length,
        cachedCategories: productCategories.length,
        skippedProductServerRead: true
    });

    return {
        records: enrichedOrders,
        extras: {
            returnOrders: enrichedOrders,
            returnInvoices: returnInvoices
        },
        readCount: queryCount
    };
}

async function fetchInvoicesData() {
    var startedAt = getPerformanceNow();
    var orderRows = getOrderRowsForInvoicePrintStatus();
    var orderPromise = orderRows ? Promise.resolve(orderRows) : orderService.getAllOrders();
    var groups = await Promise.all([
        invoiceService.getWorkingInvoices(),
        orderPromise,
        settingsService.getInvoiceSettings().catch(function() {
            return {};
        })
    ]);
    var invoices = groups[0] || [];
    var orders = groups[1] || [];
    var settings = groups[2] || {};
    var records = applyInvoicePrintStatus(invoices, orders);
    var queryCount = orderRows ? 3 : 4;

    logPerf('Invoices Firestore refresh', startedAt);
    logCache('Invoices', 'Firestore queries initiated by view', {
        queries: queryCount,
        records: records.length,
        reusedOrdersCache: !!orderRows
    });

    return {
        records: records,
        extras: {
            orders: cloneRecords(orders),
            invoiceSettings: settings
        },
        readCount: queryCount
    };
}

function getOrderRowsForInvoicePrintStatus() {
    var ordersState = sessionDataStore.orders;
    if (ordersState && ordersState.loaded && ordersState.records.length > 0) {
        return cloneRecords(ordersState.records);
    }

    return null;
}

function applyInvoicePrintStatus(invoices, orders) {
    var orderMap = {};
    var index = 0;

    while (index < orders.length) {
        var order = orders[index];
        if (order && order.id) {
            orderMap[order.id] = order;
        }
        index = index + 1;
    }

    return (invoices || []).map(function(invoice) {
        var order = invoice && invoice.orderId ? orderMap[invoice.orderId] : null;
        return Object.assign({}, invoice, {
            isPrinted: order ? order.isPrinted === true : false
        });
    });
}

function categoryKey(value) {
    return String(value || '').trim().toLowerCase();
}

function categoryIdFromName(value) {
    var normalized = categoryKey(value)
        .replace(/[^\p{L}\p{N}]+/gu, '-')
        .replace(/^-+|-+$/g, '');
    return normalized || 'uncategorized';
}

function firstValue(values) {
    var index = 0;
    while (index < values.length) {
        if (String(values[index] || '').trim()) {
            return values[index];
        }
        index = index + 1;
    }
    return '';
}

function buildProductCategoryLookup(categories) {
    var lookup = {};
    var index = 0;

    while (index < categories.length) {
        var category = categories[index];
        var name = category.name || category.name_en || category.title || 'Uncategorized';
        var entry = {
            id: category.id || categoryIdFromName(name),
            name: name
        };
        var keys = [
            category.id,
            category.name,
            category.name_en,
            category.name_ru,
            category.name_kg,
            category.slug,
            category.handle,
            category.value
        ];
        var keyIndex = 0;
        while (keyIndex < keys.length) {
            var normalized = categoryKey(keys[keyIndex]);
            if (normalized) {
                lookup[normalized] = entry;
            }
            keyIndex = keyIndex + 1;
        }
        index = index + 1;
    }

    return lookup;
}

function resolveProductCategory(item, product, categoryLookup) {
    var sourceItem = item || {};
    var sourceProduct = product || {};
    var candidates = [
        sourceItem.categoryId,
        sourceItem.category_id,
        sourceItem.categoryID,
        sourceItem.categorySlug,
        sourceItem.category,
        sourceItem.categoryName,
        sourceItem.category_name,
        sourceProduct.categoryId,
        sourceProduct.category_id,
        sourceProduct.categoryID,
        sourceProduct.categorySlug,
        sourceProduct.category,
        sourceProduct.categoryName,
        sourceProduct.category_name
    ];
    var index = 0;

    while (index < candidates.length) {
        var matched = categoryLookup[categoryKey(candidates[index])];
        if (matched) {
            return matched;
        }
        index = index + 1;
    }

    var fallbackName = firstValue([
        sourceItem.categoryName,
        sourceItem.category_name,
        sourceItem.category,
        sourceProduct.categoryName,
        sourceProduct.category_name,
        sourceProduct.category
    ]);

    if (fallbackName) {
        return {
            id: categoryIdFromName(fallbackName),
            name: fallbackName
        };
    }

    return {
        id: 'uncategorized',
        name: 'Uncategorized'
    };
}

function buildOrdersWithContext(orders, customers, products, productCategories, returnInvoices) {
    var categoryMap = {};
    var productMap = {};
    var returnInvoiceByOrderId = {};
    var index = 0;

    while (index < customers.length) {
        var customer = customers[index];
        var customerName = (customer.companyName || customer.name || '').toLowerCase().trim();
        if (customerName) {
            categoryMap[customerName] = customer.category || 'C';
        }
        index = index + 1;
    }

    index = 0;
    while (index < products.length) {
        var product = products[index];
        if (product && product.id) {
            productMap[product.id] = product;
        }
        index = index + 1;
    }

    index = 0;
    while (index < returnInvoices.length) {
        var returnInvoice = returnInvoices[index];
        if (returnInvoice && returnInvoice.orderId) {
            returnInvoiceByOrderId[returnInvoice.orderId] = returnInvoice;
        }
        index = index + 1;
    }

    var now = new Date();
    var productCategoryLookup = buildProductCategoryLookup(productCategories || []);

    return (orders || []).map(function(order) {
        return buildSingleOrderWithContext(order, {
            now: now,
            productMap: productMap,
            categoryMap: categoryMap,
            productCategoryLookup: productCategoryLookup,
            returnInvoice: returnInvoiceByOrderId[order.id] || null
        });
    });
}

function buildSingleOrderWithContext(order, context) {
    var returnInvoice = context.returnInvoice;
    var date = null;

    if (order.orderDate) {
        date = new Date(order.orderDate);
    } else if (order.createdAt && typeof order.createdAt.toDate === 'function') {
        date = order.createdAt.toDate();
    } else if (order.createdAt) {
        date = new Date(order.createdAt);
    } else {
        date = context.now;
    }

    var timestamp = Number.isNaN(date.getTime()) ? context.now.getTime() : date.getTime();
    var diffDays = Math.floor((context.now.getTime() - timestamp) / (1000 * 60 * 60 * 24));

    return Object.assign({}, order, {
        items: (order.items || []).map(function(item) {
            return buildOrderItemWithContext(item, context.productMap, context.productCategoryLookup, returnInvoice);
        }),
        returnSummary: returnInvoice && returnInvoice.returnSummary ? returnInvoice.returnSummary : order.returnSummary,
        returns: returnInvoice && returnInvoice.returns ? returnInvoice.returns : order.returns,
        customerCategory: context.categoryMap[(order.customerName || '').toLowerCase().trim()] || 'C',
        agingDays: Math.max(0, diffDays),
        isOutstanding: order.status === 'confirmed' || order.status === 'fulfilled' || order.status === 'fullfilled'
    });
}

function buildOrderItemWithContext(item, productMap, productCategoryLookup, returnInvoice) {
    var product = productMap[item.productId] || {};
    var category = resolveProductCategory(item, product, productCategoryLookup);
    var returnedInvoiceItem = findMatchingReturnedInvoiceItem(item, returnInvoice);
    var returnedQuantity = returnedInvoiceItem ? Number(returnedInvoiceItem.returnedQuantity || 0) : Number(item.returnedQuantity || item.returnQuantity || 0);

    return Object.assign({}, item, {
        returnedQuantity: returnedQuantity,
        returnQuantity: returnedQuantity,
        categoryId: category.id,
        categoryName: category.name
    });
}

function findMatchingReturnedInvoiceItem(item, returnInvoice) {
    var items = returnInvoice && Array.isArray(returnInvoice.items) ? returnInvoice.items : [];
    var index = 0;

    while (index < items.length) {
        var invoiceItem = items[index];
        if ((item.lineItemId && invoiceItem.lineItemId === item.lineItemId) ||
            (item.productId && invoiceItem.productId === item.productId)) {
            return invoiceItem;
        }
        index = index + 1;
    }

    return null;
}

async function runIntent(intentModule, factoryName, options) {
    var actor = getCurrentActor();
    var payload = {
        options: options || {},
        storeApi: publicStoreApi
    };
    var intent = intentModule[factoryName](actor, payload, {
        source: options && options.source ? options.source : 'ui'
    });
    var result = await icfPipeline.run(intent);

    if (!result || result.ok !== true) {
        throw new Error(getIntentErrorMessage(result));
    }

    return result.data || {};
}

function getIntentErrorMessage(result) {
    if (!result) {
        return 'Session data intent failed.';
    }

    if (result.errors && result.errors.length > 0) {
        return result.errors[0];
    }

    if (result.reason) {
        return result.reason;
    }

    if (result.message) {
        return result.message;
    }

    return 'Session data intent failed.';
}

async function loadCollection(collectionName, options) {
    ensureOwner();
    var state = sessionDataStore[collectionName];
    var label = collectionName === 'orders' ? 'Orders' : 'Invoices';
    var startedAt = getPerformanceNow();
    var safeOptions = options || {};

    if (state.loaded && safeOptions.forceRefresh !== true) {
        logPerf(label + ' cache lookup', startedAt);
        logCache(label, 'cache hit', {
            source: 'memory',
            records: state.records.length,
            reusedLoadingPromise: false,
            shouldRefresh: isStale(state)
        });
        return buildLoadResult(state, 'memory', true, false, false);
    }

    if (state.loadingPromise && safeOptions.forceRefresh !== true) {
        logPerf(label + ' cache lookup', startedAt);
        logCache(label, 'cache miss; reused loading promise', {
            records: state.records.length,
            reusedLoadingPromise: true
        });
        return state.loadingPromise;
    }

    var dexieRecord = safeOptions.skipDexie === true ? null : await readDexieCache(collectionName);
    if (dexieRecord && Array.isArray(dexieRecord.records) && dexieRecord.records.length > 0 && safeOptions.forceRefresh !== true) {
        assignCollectionData(state, dexieRecord.records, dexieRecord.extras || {}, 0, 'dexie-cache');
        logPerf(label + ' cache lookup', startedAt);
        logCache(label, 'cache hit', {
            source: 'dexie',
            records: state.records.length,
            reusedLoadingPromise: false,
            shouldRefresh: true
        });
        return buildLoadResult(state, 'dexie', true, false, true);
    }

    logPerf(label + ' cache lookup', startedAt);
    logCache(label, 'cache miss', {
        source: 'firestore',
        reusedLoadingPromise: false
    });

    state.loadingPromise = fetchAndAssignCollection(collectionName, safeOptions);
    return state.loadingPromise;
}

async function refreshCollection(collectionName, options) {
    ensureOwner();
    var safeOptions = Object.assign({}, options || {}, {
        forceRefresh: true,
        skipDexie: true
    });
    var state = sessionDataStore[collectionName];
    var label = collectionName === 'orders' ? 'Orders' : 'Invoices';

    if (state.loadingPromise) {
        logCache(label, 'refresh reused loading promise', {
            reusedLoadingPromise: true
        });
        return state.loadingPromise;
    }

    state.loadingPromise = fetchAndAssignCollection(collectionName, safeOptions);
    return state.loadingPromise;
}

async function fetchAndAssignCollection(collectionName, options) {
    var state = sessionDataStore[collectionName];
    var label = collectionName === 'orders' ? 'Orders' : 'Invoices';
    var reconciliationStartedAt = 0;

    try {
        var loaded = collectionName === 'orders' ? await fetchOrdersData() : await fetchInvoicesData();
        reconciliationStartedAt = getPerformanceNow();
        var mutationBoundary = state.lastMutationAt || 0;
        var incomingRecords = mergeRecordsByFreshness(state.records, loaded.records || []);
        var assignment = assignCollectionData(state, incomingRecords, loaded.extras || {}, loaded.readCount, 'firestore-refresh');

        if (mutationBoundary && state.loadedAt && state.loadedAt < mutationBoundary) {
            logCache(label, 'skipped stale assignment boundary check', {
                mutationBoundary: mutationBoundary
            });
        }

        logPerf(label + ' reconciliation', reconciliationStartedAt);
        logCache(label, 'records rendered/reconciled', {
            records: state.records.length,
            changed: assignment.changed,
            queries: state.lastReadCount
        });

        return buildLoadResult(state, 'firestore', false, assignment.changed, false);
    } catch (error) {
        state.lastError = error;
        logCache(label, 'background refresh failed', {
            message: error && error.message ? error.message : ''
        });
        if (state.loaded) {
            return buildLoadResult(state, 'memory-after-error', true, false, false);
        }
        throw error;
    } finally {
        state.loadingPromise = null;
    }
}

function buildLoadResult(state, source, cacheHit, changed, shouldRefresh) {
    return {
        records: cloneRecords(state.records),
        extras: cloneExtras(state.extras),
        meta: {
            source: source,
            cacheHit: cacheHit === true,
            changed: changed === true,
            loaded: state.loaded === true,
            loadedAt: state.loadedAt,
            revision: state.revision,
            shouldRefresh: shouldRefresh === true || isStale(state),
            readCount: state.lastReadCount || 0,
            invalidationReason: state.lastInvalidationReason || ''
        }
    };
}

async function invalidateCollection(collectionName, reason) {
    ensureOwner();
    var state = sessionDataStore[collectionName];
    var label = collectionName === 'orders' ? 'Orders' : 'Invoices';
    resetCollectionState(state, reason || 'manual-invalidate');
    await deleteDexieCache(collectionName);
    logCache(label, 'cache invalidated', {
        reason: reason || 'manual-invalidate'
    });
    return buildLoadResult(state, 'invalidated', false, true, true);
}

function updateRecord(collectionName, id, patch, reason) {
    ensureOwner();
    var state = sessionDataStore[collectionName];
    var records = state.records || [];
    var found = false;
    var index = 0;

    while (index < records.length) {
        if (records[index] && records[index].id === id) {
            records[index] = Object.assign({}, records[index], patch || {}, {
                id: id
            });
            found = true;
            break;
        }
        index = index + 1;
    }

    if (!found && patch) {
        records.unshift(Object.assign({}, patch, {
            id: id
        }));
    }

    state.records = records;
    state.loaded = state.loaded || found;
    state.loadedAt = state.loadedAt || Date.now();
    state.revision = state.revision + 1;
    state.lastMutationAt = Date.now();
    state.lastInvalidationReason = reason || 'mutation-update';
    writeDexieCache(collectionName, state.records, state.extras);
    logCache(collectionName === 'orders' ? 'Orders' : 'Invoices', 'cache updated after mutation', {
        id: id,
        reason: reason || 'mutation-update',
        records: state.records.length
    });
}

function removeRecord(collectionName, id, reason) {
    ensureOwner();
    var state = sessionDataStore[collectionName];
    var records = state.records || [];
    var nextRecords = [];
    var index = 0;

    while (index < records.length) {
        if (!records[index] || records[index].id !== id) {
            nextRecords.push(records[index]);
        }
        index = index + 1;
    }

    state.records = nextRecords;
    state.revision = state.revision + 1;
    state.lastMutationAt = Date.now();
    state.lastInvalidationReason = reason || 'mutation-remove';
    writeDexieCache(collectionName, state.records, state.extras);
    logCache(collectionName === 'orders' ? 'Orders' : 'Invoices', 'cache removed record after mutation', {
        id: id,
        reason: reason || 'mutation-remove',
        records: state.records.length
    });
}

async function processSessionIntent(request) {
    if (!request) {
        throw new Error('Session intent request is required.');
    }

    if (request.actionName === 'load') {
        return loadCollection(request.collectionName, request.options || {});
    }

    if (request.actionName === 'refresh') {
        return refreshCollection(request.collectionName, request.options || {});
    }

    if (request.actionName === 'invalidate') {
        return invalidateCollection(request.collectionName, request.options ? request.options.reason : 'manual-invalidate');
    }

    throw new Error('Unknown session data action: ' + request.actionName);
}

var publicStoreApi = {
    processSessionIntent: processSessionIntent,

    loadOrders: function(options) {
        var safeOptions = options || {};
        return runSingleFlight('orders:load:active', function() {
            return runIntent(loadOrdersIntentModule, 'createLoadOrdersIntent', safeOptions);
        }, { force: safeOptions.forceRefresh === true });
    },

    refreshOrders: function(options) {
        var safeOptions = options || {};
        return runSingleFlight('orders:refresh:includeArchived:true', function() {
            return runIntent(refreshOrdersIntentModule, 'createRefreshOrdersIntent', safeOptions);
        }, { force: safeOptions.forceRefresh === true });
    },

    invalidateOrdersCache: function(reason) {
        return runIntent(invalidateOrdersCacheIntentModule, 'createInvalidateOrdersCacheIntent', {
            reason: reason || 'manual-invalidate'
        });
    },

    loadInvoices: function(options) {
        var safeOptions = options || {};
        return runSingleFlight('invoices:load:working', function() {
            return runIntent(loadInvoicesIntentModule, 'createLoadInvoicesIntent', safeOptions);
        }, { force: safeOptions.forceRefresh === true });
    },

    refreshInvoices: function(options) {
        var safeOptions = options || {};
        return runSingleFlight('invoices:refresh:working', function() {
            return runIntent(refreshInvoicesIntentModule, 'createRefreshInvoicesIntent', safeOptions);
        }, { force: safeOptions.forceRefresh === true });
    },

    invalidateInvoicesCache: function(reason) {
        return runIntent(invalidateInvoicesCacheIntentModule, 'createInvalidateInvoicesCacheIntent', {
            reason: reason || 'manual-invalidate'
        });
    },

    getOrdersSnapshot: function() {
        return getSnapshot('orders');
    },

    getInvoicesSnapshot: function() {
        return getSnapshot('invoices');
    },

    updateOrderRecord: function(id, patch, reason) {
        updateRecord('orders', id, patch, reason);
    },

    updateInvoiceRecord: function(id, patch, reason) {
        updateRecord('invoices', id, patch, reason);
    },

    removeInvoiceRecord: function(id, reason) {
        removeRecord('invoices', id, reason);
    },

    removeOrderRecord: function(id, reason) {
        removeRecord('orders', id, reason);
    },

    clearUserScopedMemory: function(reason) {
        resetCollectionState(sessionDataStore.orders, reason || 'manual-clear');
        resetCollectionState(sessionDataStore.invoices, reason || 'manual-clear');
        resetCollectionState(sessionDataStore.archivedInvoices, reason || 'manual-clear');
    }
};

export { sessionDataStore };
export default publicStoreApi;