const BACKEND_HOSTS = [
    'firestore.googleapis.com',
    'securetoken.googleapis.com',
    'identitytoolkit.googleapis.com',
    'firebaseinstallations.googleapis.com',
    'firebasestorage.googleapis.com',
    'storage.googleapis.com',
    'www.googleapis.com',
    'oauth2.googleapis.com'
];

const STATIC_DESTINATIONS = [
    'script',
    'style',
    'worker',
    'image',
    'font',
    'manifest'
];

function getUrl(value) {
    if (value instanceof URL) {
        return value;
    }
    return new URL(String(value), 'https://oako.local');
}

export function isBackendOrAuthUrl(value) {
    var url = getUrl(value);
    if (BACKEND_HOSTS.indexOf(url.hostname) !== -1) {
        return true;
    }
    if (url.pathname.indexOf('/google.firestore.v1.Firestore/') !== -1) {
        return true;
    }
    if (url.pathname.indexOf('/identitytoolkit/') !== -1) {
        return true;
    }
    return false;
}

export function isHealthCheckUrl(value) {
    var url = getUrl(value);
    return url.pathname === '/health.json' || url.pathname.endsWith('/health.json');
}

export function isStaticAssetRequest(request, url) {
    var safeRequest = request || {};
    var safeUrl = url ? getUrl(url) : getUrl(safeRequest.url || '/');
    var destination = safeRequest.destination || '';
    var extensionMatch = safeUrl.pathname.match(/\.(css|js|mjs|png|jpg|jpeg|svg|webp|gif|ico|woff|woff2|json|webmanifest)$/i);

    if (STATIC_DESTINATIONS.indexOf(destination) !== -1) {
        return true;
    }

    return extensionMatch !== null;
}

export function shouldBypassRuntimeCaching(request, url) {
    var safeRequest = request || {};
    var safeUrl = url ? getUrl(url) : getUrl(safeRequest.url || '/');

    if (safeRequest.method && safeRequest.method !== 'GET') {
        return true;
    }

    if (isHealthCheckUrl(safeUrl)) {
        return true;
    }

    if (isBackendOrAuthUrl(safeUrl)) {
        return true;
    }

    if (safeUrl.pathname.indexOf('/__/auth/') === 0) {
        return true;
    }

    return false;
}

export function shouldHandleNavigation(request, url) {
    var safeRequest = request || {};
    if (safeRequest.mode !== 'navigate') {
        return false;
    }
    return !shouldBypassRuntimeCaching(safeRequest, url);
}
