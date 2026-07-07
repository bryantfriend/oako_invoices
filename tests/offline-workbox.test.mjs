import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import fs from 'node:fs';

import {
    OFFLINE_DATABASE_NAME,
    acquireSyncLease,
    getNextSequenceNumber,
    getOfflineDatabase,
    releaseSyncLease,
    resetOfflineDatabaseForTests,
    resetStaleSyncingIntents,
    saveIntentAndProjection
} from '../js/services/offlineDexieDb.js';
import {
    classifySyncError,
    calculateRetryDelayMilliseconds,
    SYNC_RETRY_STATUSES
} from '../js/services/syncRetryPolicy.js';
import {
    isBackendOrAuthUrl,
    isHealthCheckUrl,
    shouldBypassRuntimeCaching,
    shouldHandleNavigation
} from '../js/service-worker/cacheRules.js';

function deleteDatabase(name) {
    return new Promise(function(resolve, reject) {
        var request = indexedDB.deleteDatabase(name);
        request.onsuccess = function() {
            resolve();
        };
        request.onerror = function() {
            reject(request.error);
        };
        request.onblocked = function() {
            resolve();
        };
    });
}

async function resetDatabase() {
    resetOfflineDatabaseForTests();
    await deleteDatabase(OFFLINE_DATABASE_NAME);
    resetOfflineDatabaseForTests();
}

test('Dexie schema creates offline intent, projection, metadata, and lock stores', async function() {
    await resetDatabase();
    var database = getOfflineDatabase();
    await database.open();

    assert.ok(database.offlineIntents);
    assert.ok(database.invoiceProjections);
    assert.ok(database.syncMetadata);
    assert.ok(database.syncLocks);
    assert.ok(database.queue);

    database.close();
});

test('Dexie sequence counter preserves FIFO ordering', async function() {
    await resetDatabase();

    var first = await getNextSequenceNumber();
    var second = await getNextSequenceNumber();
    var third = await getNextSequenceNumber();

    assert.deepEqual([first, second, third], [1, 2, 3]);
});

test('Dexie saves intent and invoice projection atomically', async function() {
    await resetDatabase();
    var database = getOfflineDatabase();
    await database.open();

    var intent = {
        intentId: 'intent-atomic',
        status: 'pending',
        actorId: 'user-1',
        aggregateType: 'invoice',
        aggregateId: 'invoice-1',
        sequenceNumber: 1,
        createdAt: '2026-06-22T00:00:00.000Z',
        updatedAt: '2026-06-22T00:00:00.000Z'
    };
    var projection = {
        invoiceId: 'invoice-1',
        syncState: 'pending_sync',
        actorId: 'user-1',
        updatedAt: '2026-06-22T00:00:00.000Z',
        invoice: {
            id: 'invoice-1',
            totalAmount: 10
        }
    };

    await saveIntentAndProjection(intent, projection);

    assert.equal((await database.offlineIntents.get('intent-atomic')).aggregateId, 'invoice-1');
    assert.equal((await database.invoiceProjections.get('invoice-1')).invoice.totalAmount, 10);

    database.close();
});

test('Dexie sync lease prevents two tabs from processing the queue', async function() {
    await resetDatabase();

    var first = await acquireSyncLease('tab-a', Date.UTC(2026, 5, 22, 10, 0, 0));
    var second = await acquireSyncLease('tab-b', Date.UTC(2026, 5, 22, 10, 0, 1));
    var released = await releaseSyncLease('tab-a');
    var third = await acquireSyncLease('tab-b', Date.UTC(2026, 5, 22, 10, 0, 2));

    assert.equal(first, true);
    assert.equal(second, false);
    assert.equal(released, true);
    assert.equal(third, true);
});

test('Dexie stale syncing recovery returns crashed rows to pending', async function() {
    await resetDatabase();
    var database = getOfflineDatabase();
    await database.open();

    await database.offlineIntents.put({
        intentId: 'intent-stale',
        status: 'syncing',
        actorId: 'user-1',
        aggregateType: 'invoice',
        aggregateId: 'invoice-1',
        sequenceNumber: 1,
        lastAttemptAt: '2026-06-22T10:00:00.000Z',
        createdAt: '2026-06-22T10:00:00.000Z',
        updatedAt: '2026-06-22T10:00:00.000Z'
    });

    await resetStaleSyncingIntents(Date.UTC(2026, 5, 22, 10, 2, 0));

    assert.equal((await database.offlineIntents.get('intent-stale')).status, 'pending');
    database.close();
});

test('Retry policy classifies retryable, authentication, terminal, and conflict failures', function() {
    assert.equal(classifySyncError({ code: 'unavailable', message: 'try later' }).status, SYNC_RETRY_STATUSES.RETRY_WAIT);
    assert.equal(classifySyncError({ code: 'unauthenticated', message: 'missing auth' }).status, SYNC_RETRY_STATUSES.BLOCKED_AUTHENTICATION);
    assert.equal(classifySyncError({ code: 'permission-denied', message: 'no' }).status, SYNC_RETRY_STATUSES.FAILED_TERMINAL);
    assert.equal(classifySyncError(new Error('sync_conflict')).status, SYNC_RETRY_STATUSES.CONFLICT);
});

test('Retry backoff grows and remains bounded', function() {
    var first = calculateRetryDelayMilliseconds(1, 0);
    var third = calculateRetryDelayMilliseconds(3, 0);
    var large = calculateRetryDelayMilliseconds(50, 1);

    assert.equal(first, 1000);
    assert.equal(third, 4000);
    assert.equal(large, 300000);
});

test('Workbox route rules exclude dynamic backend and mutation requests', function() {
    assert.equal(isBackendOrAuthUrl('https://firestore.googleapis.com/google.firestore.v1.Firestore/Write/channel'), true);
    assert.equal(shouldBypassRuntimeCaching({ method: 'POST', url: 'https://example.com/invoices' }), true);
    assert.equal(shouldBypassRuntimeCaching({ method: 'GET', url: 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword' }), true);
    assert.equal(shouldHandleNavigation({ method: 'GET', mode: 'navigate', url: 'https://oako.local/index.html' }, new URL('https://oako.local/index.html')), true);
});

test('Workbox build output is generated and does not keep the injection marker', function() {
    var worker = fs.readFileSync('sw.js', 'utf8');
    assert.equal(worker.indexOf('__WB_MANIFEST'), -1);
    assert.notEqual(worker.indexOf('OAKO_SKIP_WAITING'), -1);
    assert.notEqual(worker.indexOf('offline.html'), -1);
});

test('Application update service uses user-controlled activation and cache-bypassed version checks', function() {
    var source = fs.readFileSync('js/services/appUpdateService.js', 'utf8');
    assert.notEqual(source.indexOf('messageSkipWaiting'), -1);
    assert.notEqual(source.indexOf("cache: 'no-store'"), -1);
    assert.equal(source.indexOf('skipWaiting()'), -1);
});

test('Synchronization UI is excluded from print output', function() {
    var css = fs.readFileSync('css/styles.css', 'utf8');
    assert.notEqual(css.indexOf('@media print'), -1);
    assert.notEqual(css.indexOf('.sync-status-badge'), -1);
    assert.notEqual(css.indexOf('.oako-update-banner'), -1);
});

test('Offline invoice print dependencies use cached/local data before network reads', function() {
    var settingsSource = fs.readFileSync('js/services/settingsService.js', 'utf8');
    var customerSource = fs.readFileSync('js/services/customerService.js', 'utf8');
    var productSource = fs.readFileSync('js/services/productService.js', 'utf8');
    var invoiceSource = fs.readFileSync('js/services/invoiceService.js', 'utf8');
    var orderSource = fs.readFileSync('js/services/orderService.js', 'utf8');

    assert.notEqual(settingsSource.indexOf('!offlineStatusService.isOnline()'), -1);
    assert.notEqual(settingsSource.indexOf('await readCachedRowsAsync(SETTINGS_CACHE_KEY)'), -1);
    assert.notEqual(customerSource.indexOf("await readCachedRowsAsync('customers:all')"), -1);
    assert.notEqual(productSource.indexOf("await readCachedRowsAsync('products:all')"), -1);
    assert.notEqual(productSource.indexOf("await readCachedRowsAsync('categories:all')"), -1);
    assert.notEqual(invoiceSource.indexOf('offlineQueueService.getLocalInvoiceSnapshot(id)'), -1);
    assert.notEqual(invoiceSource.indexOf('getDocFromCache(docRef)'), -1);
    assert.notEqual(orderSource.indexOf('getDocFromCache(docRef)'), -1);
});
test('Route render errors stay on the current route instead of redirecting to Orders', function() {
    var routerSource = fs.readFileSync('js/router.js', 'utf8');
    var renderCatchStart = routerSource.indexOf('console.error("View Render Error:"');
    var noRouteStart = routerSource.indexOf('console.warn("No route found for"');
    var renderCatchBlock = routerSource.slice(renderCatchStart, noRouteStart);

    assert.notEqual(renderCatchStart, -1);
    assert.equal(renderCatchBlock.indexOf('this.navigate(ROUTES.DASHBOARD)'), -1);
    assert.notEqual(renderCatchBlock.indexOf('renderRouteError'), -1);
});

test('Offline order creation is queued, merged into reads, and replayed by sync', function() {
    var orderSource = fs.readFileSync('js/services/orderService.js', 'utf8');
    var queueSource = fs.readFileSync('js/services/offlineQueueService.js', 'utf8');
    var syncSource = fs.readFileSync('js/services/syncService.js', 'utf8');

    assert.notEqual(orderSource.indexOf("enqueue('createOrder', 'order'"), -1);
    assert.notEqual(orderSource.indexOf("getLocalEntitySnapshots('order')"), -1);
    assert.notEqual(queueSource.indexOf("entityType === 'order'"), -1);
    assert.notEqual(syncSource.indexOf("queueItem.entityType === 'order'"), -1);
    assert.notEqual(syncSource.indexOf('writeOrderCreate(queueItem)'), -1);
});

test('Pending offline orders can be archived or removed without duplicate syncs', function() {
    var orderSource = fs.readFileSync('js/services/orderService.js', 'utf8');
    var queueSource = fs.readFileSync('js/services/offlineQueueService.js', 'utf8');
    var syncSource = fs.readFileSync('js/services/syncService.js', 'utf8');
    var dashboardSource = fs.readFileSync('js/views/dashboardView.js', 'utf8');

    assert.notEqual(orderSource.indexOf('isPendingLocalCreate'), -1);
    assert.notEqual(orderSource.indexOf('offlineQueueService.compactPendingOrderCreate'), -1);
    assert.notEqual(orderSource.indexOf('offlineQueueService.removePendingOrderCreate'), -1);
    assert.notEqual(orderSource.indexOf("enqueue('archiveOrder', 'order'"), -1);
    assert.notEqual(queueSource.indexOf('compactPendingOrderCreate'), -1);
    assert.notEqual(queueSource.indexOf('removePendingOrderCreate'), -1);
    assert.notEqual(syncSource.indexOf("queueItem.actionType === 'archiveOrder'"), -1);
    assert.notEqual(syncSource.indexOf('writeOrderArchive(queueItem)'), -1);
    assert.notEqual(dashboardSource.indexOf('removeCachedOrder'), -1);
});

test('Manual Sync Now reports diagnostics and bypasses retry wait', function() {
    var syncSource = fs.readFileSync('js/services/syncService.js', 'utf8');
    var queueSource = fs.readFileSync('js/services/offlineQueueService.js', 'utf8');
    var layoutSource = fs.readFileSync('js/views/layoutView.js', 'utf8');

    assert.notEqual(layoutSource.indexOf('processQueue({ manual: true })'), -1);
    assert.notEqual(layoutSource.indexOf('[SYNC_NOW] clicked'), -1);
    assert.notEqual(layoutSource.indexOf('Cannot reach Firestore yet'), -1);
    assert.notEqual(syncSource.indexOf('failureReason'), -1);
    assert.notEqual(syncSource.indexOf('firestore_unreachable'), -1);
    assert.notEqual(syncSource.indexOf('authentication_required'), -1);
    assert.notEqual(syncSource.indexOf('queueProcessorStarted: true'), -1);
    assert.notEqual(syncSource.indexOf('includeRetryWait: manual'), -1);
    assert.notEqual(queueSource.indexOf('safeOptions.includeRetryWait === true'), -1);
});

test('Sync diagnostics expose a sanitized queue inspector', function() {
    var queueSource = fs.readFileSync('js/services/offlineQueueService.js', 'utf8');
    var layoutSource = fs.readFileSync('js/views/layoutView.js', 'utf8');

    assert.notEqual(queueSource.indexOf('items: items.map(function(item)'), -1);
    assert.notEqual(queueSource.indexOf('lastErrorCode'), -1);
    assert.equal(queueSource.indexOf('payload: item.payload'), -1);
    assert.notEqual(layoutSource.indexOf('Queue Items'), -1);
    assert.notEqual(layoutSource.indexOf('diagnostics.queue.items || []'), -1);
});

test('Offline readiness and conflict review are exposed in diagnostics and navigation', function() {
    var diagnosticsSource = fs.readFileSync('js/services/syncDiagnosticsService.js', 'utf8');
    var layoutSource = fs.readFileSync('js/views/layoutView.js', 'utf8');
    var sidebarSource = fs.readFileSync('js/components/sidebar.js', 'utf8');
    var mainSource = fs.readFileSync('js/main.js', 'utf8');

    assert.notEqual(diagnosticsSource.indexOf('offlineReadinessService.getStatus()'), -1);
    assert.notEqual(layoutSource.indexOf('renderOfflineReadinessPanel'), -1);
    assert.notEqual(sidebarSource.indexOf('ROUTES.SYNC_CONFLICTS'), -1);
    assert.notEqual(mainSource.indexOf('renderConflictReview'), -1);
});

test('Create order customer picker survives weak product or customer network loads', function() {
    var createOrderSource = fs.readFileSync('js/views/createOrderView.js', 'utf8');
    var customerSource = fs.readFileSync('js/services/customerService.js', 'utf8');

    assert.notEqual(createOrderSource.indexOf('renderCreateOrderLoadingShell'), -1);
    assert.notEqual(createOrderSource.indexOf('withDependencyTimeout'), -1);
    assert.notEqual(createOrderSource.indexOf('Loading saved customers'), -1);
    assert.notEqual(createOrderSource.indexOf('No saved customers are available on this device yet'), -1);
    assert.notEqual(customerSource.indexOf("filterActiveCustomers(await readCachedRowsAsync('customers:all'))"), -1);
    assert.notEqual(customerSource.indexOf('Using cached customers after live customer load failed'), -1);
});


test('health.json is never treated as a cacheable runtime asset', function() {
    var cacheRulesSource = fs.readFileSync('js/service-worker/cacheRules.js', 'utf8');
    var healthUrl = new URL('https://oako.local/health.json?ts=123');

    assert.equal(isHealthCheckUrl(healthUrl), true);
    assert.equal(shouldBypassRuntimeCaching({ method: 'GET' }, healthUrl), true);
    assert.notEqual(cacheRulesSource.indexOf('isHealthCheckUrl'), -1);
    assert.notEqual(cacheRulesSource.indexOf('return false;'), -1);
});

test('Connectivity service does not rely on navigator.onLine as source of truth', function() {
    var connectionSource = fs.readFileSync('js/services/connectionStateService.js', 'utf8');
    var offlineStatusSource = fs.readFileSync('js/services/offlineStatusService.js', 'utf8');

    assert.notEqual(connectionSource.indexOf('health.json'), -1);
    assert.notEqual(connectionSource.indexOf("cache: 'no-store'"), -1);
    assert.notEqual(connectionSource.indexOf('getDocFromServer'), -1);
    assert.notEqual(offlineStatusSource.indexOf('connectionStateService.isCloudReachable()'), -1);
    assert.equal(offlineStatusSource.indexOf('navigator.onLine !== false'), -1);
});

test('Unknown routes and invoice offline errors do not fall back to Orders', function() {
    var routerSource = fs.readFileSync('js/router.js', 'utf8');
    var invoiceViewSource = fs.readFileSync('js/views/invoiceView.js', 'utf8');
    var noRouteStart = routerSource.indexOf('console.warn("No route found for", path);');
    var noRouteBlock = routerSource.slice(noRouteStart, noRouteStart + 450);

    assert.notEqual(routerSource.indexOf('[ROUTE] requested:'), -1);
    assert.notEqual(noRouteStart, -1);
    assert.equal(noRouteBlock.indexOf('this.navigate(ROUTES.DASHBOARD)'), -1);
    assert.notEqual(invoiceViewSource.indexOf('Invoices are not available offline yet'), -1);
    assert.notEqual(invoiceViewSource.indexOf('fallbackUsed: false'), -1);
});

test('Offline order submit gives feedback, cache update, and pending sync badge', function() {
    var controllerSource = fs.readFileSync('js/controllers/createOrderController.js', 'utf8');
    var dashboardSource = fs.readFileSync('js/views/dashboardView.js', 'utf8');
    var orderSource = fs.readFileSync('js/services/orderService.js', 'utf8');
    var syncSource = fs.readFileSync('js/services/syncService.js', 'utf8');

    assert.notEqual(controllerSource.indexOf('Saving locally...'), -1);
    assert.notEqual(controllerSource.indexOf('Order saved offline. Will sync when connection returns.'), -1);
    assert.notEqual(controllerSource.indexOf('router.navigate(ROUTES.DASHBOARD)'), -1);
    assert.notEqual(dashboardSource.indexOf('renderInvoiceSyncPill(row)'), -1);
    assert.notEqual(orderSource.indexOf("syncStatus: isOffline ? 'pending' : 'synced'"), -1);
    assert.notEqual(syncSource.indexOf("order.syncStatus = 'synced'"), -1);
});


test('Emergency error banners and notifications can be dismissed', function() {
    var indexSource = fs.readFileSync('index.html', 'utf8');
    var notificationSource = fs.readFileSync('js/core/notificationService.js', 'utf8');

    assert.notEqual(indexSource.indexOf('showDismissibleErrorBanner'), -1);
    assert.notEqual(indexSource.indexOf("aria-label', 'Close error banner'"), -1);
    assert.notEqual(indexSource.indexOf('errDiv.remove()'), -1);
    assert.notEqual(notificationSource.indexOf("aria-label', 'Close notification'"), -1);
    assert.notEqual(notificationSource.indexOf('closeButton.addEventListener'), -1);
    assert.notEqual(notificationSource.indexOf('dismissToast'), -1);
});



test('Orders and Invoices loading states use centralized loading quotes', function() {
    var indexSource = fs.readFileSync('index.html', 'utf8');
    var quotesSource = fs.readFileSync('js/components/loadingQuotes.js', 'utf8');
    var dashboardSource = fs.readFileSync('js/views/dashboardView.js', 'utf8');
    var invoiceSource = fs.readFileSync('js/views/invoiceView.js', 'utf8');

    assert.equal(indexSource.indexOf('rotateLoadingQuotes'), -1);
    assert.equal(indexSource.indexOf('loading-inspiration-quote'), -1);
    assert.notEqual(quotesSource.indexOf('Every great bakery is built one order at a time.'), -1);
    assert.notEqual(quotesSource.indexOf('Clear invoices build clear trust.'), -1);
    assert.notEqual(quotesSource.indexOf('startLoadingQuoteRotation'), -1);
    assert.notEqual(quotesSource.indexOf('stopLoadingQuoteRotation'), -1);
    assert.notEqual(dashboardSource.indexOf("renderLoadingQuotePanel('orders')"), -1);
    assert.notEqual(invoiceSource.indexOf("renderLoadingQuotePanel('invoices')"), -1);
});


test('Offline data manager exposes cached datasets and refresh route', function() {
    var constantsSource = fs.readFileSync('js/core/constants.js', 'utf8');
    var mainSource = fs.readFileSync('js/main.js', 'utf8');
    var sidebarSource = fs.readFileSync('js/components/sidebar.js', 'utf8');
    var serviceSource = fs.readFileSync('js/services/offlineCacheService.js', 'utf8');
    var viewSource = fs.readFileSync('js/views/offlineCacheView.js', 'utf8');

    assert.notEqual(constantsSource.indexOf("OFFLINE_DATA: '/offline'"), -1);
    assert.notEqual(mainSource.indexOf('renderOfflineCache'), -1);
    assert.notEqual(sidebarSource.indexOf('Offline Data'), -1);
    assert.notEqual(serviceSource.indexOf('getCachedRowsInfo'), -1);
    assert.notEqual(serviceSource.indexOf('refreshOfflineData'), -1);
    assert.notEqual(serviceSource.indexOf('customerService.getAllCustomers()'), -1);
    assert.notEqual(serviceSource.indexOf('productService.getAllProducts()'), -1);
    assert.notEqual(viewSource.indexOf('Refresh Offline Data'), -1);
});

test('Create Order shows customer price history and favorite products', function() {
    var controllerSource = fs.readFileSync('js/controllers/createOrderController.js', 'utf8');
    var createOrderSource = fs.readFileSync('js/views/createOrderView.js', 'utf8');

    assert.notEqual(controllerSource.indexOf('getCustomerOrderHistory'), -1);
    assert.notEqual(controllerSource.indexOf('orderService.getOrdersByCustomerName'), -1);
    assert.notEqual(createOrderSource.indexOf('customer-price-history-panel'), -1);
    assert.notEqual(createOrderSource.indexOf('Customer Price History'), -1);
    assert.notEqual(createOrderSource.indexOf('buildCustomerPriceHistory'), -1);
    assert.notEqual(createOrderSource.indexOf('add-history-item'), -1);
    assert.notEqual(createOrderSource.indexOf('Usual basket and customer price history are ready.'), -1);
});

test('Orders dashboard includes an end-of-day summary report', function() {
    var dashboardSource = fs.readFileSync('js/views/dashboardView.js', 'utf8');

    assert.notEqual(dashboardSource.indexOf('end-of-day-report-btn'), -1);
    assert.notEqual(dashboardSource.indexOf('buildEndOfDaySummary'), -1);
    assert.notEqual(dashboardSource.indexOf('End-of-Day Summary'), -1);
    assert.notEqual(dashboardSource.indexOf('Cash Collected'), -1);
    assert.notEqual(dashboardSource.indexOf('Pending Sync'), -1);
    assert.notEqual(dashboardSource.indexOf('Top Products Today'), -1);
});


test('Connectivity probe uses allowed Firestore read and does not let health.json alone block online mode', function() {
    var connectionSource = fs.readFileSync('js/services/connectionStateService.js', 'utf8');

    assert.notEqual(connectionSource.indexOf("doc(db, 'settings', 'offline_health')"), -1);
    assert.equal(connectionSource.indexOf("doc(db, 'system', 'health')"), -1);
    assert.notEqual(connectionSource.indexOf('firestoreResult = await runFirestoreCheck();'), -1);
    assert.notEqual(connectionSource.indexOf('if (firestoreReachable)'), -1);
    assert.notEqual(connectionSource.indexOf('Static health check failed'), -1);
});


test('Large offline reference datasets are stored in Dexie-backed full cache', function() {
    var firestoreReadSource = fs.readFileSync('js/core/firestoreRead.js', 'utf8');
    var customerSource = fs.readFileSync('js/services/customerService.js', 'utf8');
    var productSource = fs.readFileSync('js/services/productService.js', 'utf8');
    var settingsSource = fs.readFileSync('js/services/settingsService.js', 'utf8');
    var offlineCacheSource = fs.readFileSync('js/services/offlineCacheService.js', 'utf8');

    assert.notEqual(firestoreReadSource.indexOf('openOfflineDexieDatabase'), -1);
    assert.notEqual(firestoreReadSource.indexOf("DEXIE_CACHE_PREFIX = 'firestore-read:'"), -1);
    assert.notEqual(firestoreReadSource.indexOf('writeDexieCachedRows(cacheKey, rows, cachedAt)'), -1);
    assert.notEqual(firestoreReadSource.indexOf('readCachedRowsAsync'), -1);
    assert.notEqual(firestoreReadSource.indexOf('getCachedRowsInfoAsync'), -1);
    assert.notEqual(firestoreReadSource.indexOf('const cachedRows = await readCachedRowsAsync(cacheKey)'), -1);
    assert.notEqual(customerSource.indexOf("await readCachedRowsAsync('customers:all')"), -1);
    assert.notEqual(productSource.indexOf("await readCachedRowsAsync('products:all')"), -1);
    assert.notEqual(productSource.indexOf("await readCachedRowsAsync('categories:all')"), -1);
    assert.notEqual(settingsSource.indexOf('await readCachedRowsAsync(SETTINGS_CACHE_KEY)'), -1);
    assert.notEqual(offlineCacheSource.indexOf('getCachedRowsInfoAsync'), -1);
});

test('Settings saves cache locally and retry when cloud writes are unavailable', function() {
    var settingsSource = fs.readFileSync('js/services/settingsService.js', 'utf8');
    var inventorySource = fs.readFileSync('js/services/inventoryService.js', 'utf8');
    var controllerSource = fs.readFileSync('js/controllers/settingsController.js', 'utf8');
    var viewSource = fs.readFileSync('js/views/settingsView.js', 'utf8');
    var firestoreReadSource = fs.readFileSync('js/core/firestoreRead.js', 'utf8');

    assert.notEqual(settingsSource.indexOf('PENDING_SETTINGS_WRITE_KEY'), -1);
    assert.notEqual(settingsSource.indexOf('withSettingsWriteTimeout'), -1);
    assert.notEqual(settingsSource.indexOf('!offlineStatusService.isOnline()'), -1);
    assert.notEqual(settingsSource.indexOf('flushPendingInvoiceSettings'), -1);
    assert.notEqual(settingsSource.indexOf('__pendingSync'), -1);
    assert.notEqual(settingsSource.indexOf("code === 'permission-denied'"), -1);

    assert.notEqual(inventorySource.indexOf('PENDING_INVENTORY_SETTINGS_WRITE_KEY'), -1);
    assert.notEqual(inventorySource.indexOf('withInventorySettingsWriteTimeout'), -1);
    assert.notEqual(inventorySource.indexOf('flushPendingInventorySettings'), -1);
    assert.notEqual(inventorySource.indexOf('await readCachedRowsAsync(INVENTORY_SETTINGS_CACHE_KEY)'), -1);
    assert.notEqual(inventorySource.indexOf('cacheInventorySettings(settings, false)'), -1);
    assert.notEqual(inventorySource.indexOf('__pendingSync'), -1);

    assert.notEqual(firestoreReadSource.indexOf('writeDexieCachedRows(cacheKey, rows, cachedAt);'), -1);
    assert.notEqual(firestoreReadSource.indexOf("if (typeof window === 'undefined' || !window.localStorage)"), -1);
    assert.notEqual(controllerSource.indexOf('Settings saved on this device'), -1);
    assert.notEqual(viewSource.indexOf('Saved on this device. Will sync when online.'), -1);
});


test('Reference data reads try cloud when the browser is online even if Firestore health is degraded', function() {
    var offlineStatusSource = fs.readFileSync('js/services/offlineStatusService.js', 'utf8');
    var customerSource = fs.readFileSync('js/services/customerService.js', 'utf8');
    var productSource = fs.readFileSync('js/services/productService.js', 'utf8');
    var offlineCacheSource = fs.readFileSync('js/services/offlineCacheService.js', 'utf8');

    assert.notEqual(offlineStatusSource.indexOf('canAttemptCloudRead()'), -1);
    assert.notEqual(offlineStatusSource.indexOf('return connection.browserOnline !== false;'), -1);
    assert.notEqual(customerSource.indexOf('!offlineStatusService.canAttemptCloudRead()'), -1);
    assert.notEqual(productSource.indexOf('!offlineStatusService.canAttemptCloudRead()'), -1);
    assert.notEqual(offlineCacheSource.indexOf('!offlineStatusService.canAttemptCloudRead()'), -1);
    assert.equal(customerSource.indexOf('!offlineStatusService.isOnline()'), -1);
});


test('Runtime version pins stay in sync with deployment metadata', function() {
    var deployment = JSON.parse(fs.readFileSync('deployment-version.json', 'utf8'));
    var configSource = fs.readFileSync('js/config.js', 'utf8');
    var workerSource = fs.readFileSync('js/service-worker/source-sw.js', 'utf8');
    var indexSource = fs.readFileSync('index.html', 'utf8');
    var buildSource = fs.readFileSync('scripts/build.cjs', 'utf8');

    assert.notEqual(configSource.indexOf("VERSION: '" + deployment.appVersion + "'"), -1);
    assert.notEqual(configSource.indexOf("SERVICE_WORKER_VERSION: '" + deployment.serviceWorkerVersion + "'"), -1);
    assert.notEqual(workerSource.indexOf("OAKO_SERVICE_WORKER_VERSION = '" + deployment.serviceWorkerVersion + "'"), -1);
    assert.notEqual(indexSource.indexOf('js/main.js?v=' + deployment.appVersion), -1);
    assert.notEqual(buildSource.indexOf('updateRuntimeVersions'), -1);
});

test('Firestore permission errors include flattened auth diagnostics', function() {
    var diagnosticsSource = fs.readFileSync('js/core/firestoreDiagnostics.js', 'utf8');
    var authSource = fs.readFileSync('js/core/authService.js', 'utf8');

    assert.notEqual(diagnosticsSource.indexOf('formatFirestoreAuthState'), -1);
    assert.notEqual(diagnosticsSource.indexOf('authSummary'), -1);
    assert.notEqual(diagnosticsSource.indexOf('uid='), -1);
    assert.notEqual(diagnosticsSource.indexOf('role='), -1);
    assert.notEqual(authSource.indexOf('[auth] Admin profile check source='), -1);
    assert.notEqual(authSource.indexOf('usingCachedAdminProfile='), -1);
});
