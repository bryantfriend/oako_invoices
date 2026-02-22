const CACHE_NAME = 'kyrgyz-organics-v3';
const ASSETS_TO_CACHE = [
    './',
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
    './js/components/card.js',
    './js/components/dataTable.js',
    './js/components/formRepeater.js',
    './js/components/modal.js',
    './js/views/layoutView.js',
    './js/views/loginView.js',
    './js/views/dashboardView.js',
    './js/views/createOrderView.js',
    './js/views/orderDetailView.js',
    './js/views/invoiceView.js',
    './js/views/inventoryView.js',
    './js/views/customerView.js',
    './js/views/customerDetailView.js',
    './js/views/settingsView.js',
    './js/views/settingsView.js',
    './js/controllers/customerController.js',
    './js/controllers/invoiceController.js',
    './js/services/productService.js',
    './js/services/orderService.js',
    './js/services/invoiceService.js',
    './js/services/customerService.js',
    './js/services/settingsService.js',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
    'https://cdn.jsdelivr.net/npm/chart.js'
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

    // Exclude Firestore calls from being forcibly cached by generic worker
    if (url.origin === 'https://firestore.googleapis.com' || url.origin === 'https://securetoken.googleapis.com' || url.origin === 'https://identitytoolkit.googleapis.com') {
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
                // If network fails and it's navigation, return index.html fallback
                if (event.request.mode === 'navigate') {
                    return caches.match('./index.html');
                }
            })
    );
});
