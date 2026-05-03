const CACHE_NAME = 'kyrgyz-organics-v1.068';
const ASSETS_TO_CACHE = [
    './index.html',
    './manifest.json',
    './css/variables.css',
    './css/animations.css',
    './css/styles.css',
    './js/main.js',
    './js/router.js',
    './js/config.js',
    './js/core/constants.js',
    './js/core/firebase.js',
    './js/core/authService.js',
    './js/core/notificationService.js',
    './js/core/formatters.js',
    './js/core/guardService.js',
    './js/core/logger.js',
    './js/core/store.js',
    './js/core/validators.js',
    './js/components/card.js',
    './js/components/dataTable.js',
    './js/components/formRepeater.js',
    './js/components/modal.js',
    './js/components/loadingSkeleton.js',
    './js/components/sidebar.js',
    './js/components/statusBadge.js',
    './js/views/layoutView.js',
    './js/views/loginView.js',
    './js/views/dashboardView.js',
    './js/views/createOrderView.js',
    './js/views/orderDetailView.js',
    './js/views/invoiceView.js',
    './js/views/mobileInvoiceView.js',
    './js/views/inventoryView.js',
    './js/views/customerView.js',
    './js/views/customerDetailView.js',
    './js/views/profileView.js',
    './js/views/settingsView.js',
    './js/controllers/authController.js',
    './js/controllers/createOrderController.js',
    './js/controllers/customerController.js',
    './js/controllers/dashboardController.js',
    './js/controllers/inventoryController.js',
    './js/controllers/invoiceController.js',
    './js/controllers/orderDetailController.js',
    './js/controllers/settingsController.js',
    './js/services/productService.js',
    './js/services/orderService.js',
    './js/services/invoiceService.js',
    './js/services/pinService.js',
    './js/services/qrService.js',
    './js/services/qrActivityService.js',
    './js/services/whatsappService.js',
    './js/services/returnsService.js',
    './js/services/googleSheetsService.js',
    './js/services/gamificationService.js',
    './js/services/customerService.js',
    './js/services/inventoryService.js',
    './js/services/settingsService.js',
    './js/services/statsService.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(ASSETS_TO_CACHE))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    if (event.request.method !== 'GET') {
        return;
    }

    // Exclude Firestore calls from being forcibly cached by generic worker
    if (url.origin === 'https://firestore.googleapis.com' || url.origin === 'https://securetoken.googleapis.com' || url.origin === 'https://identitytoolkit.googleapis.com') {
        return;
    }

    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .catch(async () => {
                    const cachedIndex = await caches.match('./index.html');
                    return cachedIndex || new Response('App shell is unavailable offline.', {
                        status: 503,
                        headers: { 'Content-Type': 'text/plain' }
                    });
                })
        );
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // Cache hit - return response
                if (response) {
                    return response;
                }

                // Clone request because it's a stream and can only be consumed once
                const fetchRequest = event.request.clone();

                return fetch(fetchRequest).then(
                    (response) => {
                        // Check if valid response
                        if (!response || response.status !== 200 || response.type !== 'basic') {
                            return response;
                        }

                        // Clone response
                        const responseToCache = response.clone();

                        // Cache new dynamic resources if needed (e.g. Firebase SDKs if not precached perfectly)
                        if (url.origin === location.origin || url.origin === 'https://www.gstatic.com') {
                            caches.open(CACHE_NAME)
                                .then((cache) => {
                                    cache.put(event.request, responseToCache);
                                });
                        }

                        return response;
                    }
                );
            }).catch(() => {
                return new Response('', {
                    status: 503,
                    statusText: 'Service Unavailable'
                });
            })
    );
});
