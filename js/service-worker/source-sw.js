import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { registerRoute, setCatchHandler } from 'workbox-routing';
import { NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import {
    isStaticAssetRequest,
    shouldBypassRuntimeCaching,
    shouldHandleNavigation
} from './cacheRules.js';

const OAKO_SERVICE_WORKER_VERSION = '2.16';
const LEGACY_STATIC_CACHES = [
    'oako-invoices-v2.01',
    'oako-invoices-v2.02'
];

self.__OAKO_SERVICE_WORKER_VERSION = OAKO_SERVICE_WORKER_VERSION;

setCacheNameDetails({
    prefix: 'oako',
    suffix: OAKO_SERVICE_WORKER_VERSION,
    precache: 'precache',
    runtime: 'runtime'
});

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

self.addEventListener('message', function(event) {
    var data = event && event.data ? event.data : {};
    if (data.type === 'OAKO_SKIP_WAITING') {
        self.skipWaiting();
    }
});

self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(cacheNames) {
            return Promise.all(cacheNames.map(function(cacheName) {
                if (LEGACY_STATIC_CACHES.indexOf(cacheName) !== -1) {
                    return caches.delete(cacheName);
                }
                return Promise.resolve(false);
            }));
        })
    );
});

clientsClaim();

registerRoute(
    function(routeArgs) {
        return shouldHandleNavigation(routeArgs.request, routeArgs.url);
    },
    new NetworkFirst({
        cacheName: 'oako-navigation',
        networkTimeoutSeconds: 4,
        plugins: [
            new CacheableResponsePlugin({
                statuses: [0, 200]
            }),
            new ExpirationPlugin({
                maxEntries: 10,
                maxAgeSeconds: 7 * 24 * 60 * 60
            })
        ]
    })
);

registerRoute(
    function(routeArgs) {
        if (shouldBypassRuntimeCaching(routeArgs.request, routeArgs.url)) {
            return false;
        }
        if (routeArgs.url.origin !== self.location.origin) {
            return false;
        }
        return isStaticAssetRequest(routeArgs.request, routeArgs.url);
    },
    new StaleWhileRevalidate({
        cacheName: 'oako-static-runtime',
        plugins: [
            new CacheableResponsePlugin({
                statuses: [0, 200]
            }),
            new ExpirationPlugin({
                maxEntries: 80,
                maxAgeSeconds: 30 * 24 * 60 * 60
            })
        ]
    })
);

setCatchHandler(function(routeArgs) {
    if (routeArgs.event && routeArgs.event.request && routeArgs.event.request.mode === 'navigate') {
        return caches.match('offline.html').then(function(response) {
            return response || Response.error();
        });
    }
    return Response.error();
});
