import { ROUTES } from "./core/constants.js";
import { guardService } from "./core/guardService.js";
import { authService } from "./core/authService.js";
import { beginNavigation, isNavigationStillCurrent, ignoreStaleRouteResult, logAppliedRouteRender } from "./core/routeGuard.js";

const PUBLIC_ROUTES = [ROUTES.LOGIN, ROUTES.MOBILE_INVOICE, ROUTES.MOBILE_INVOICE_MODE];

function normalizePath(path) {
    if (path === '/index.html') return '/';
    return path;
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function getRouteName(path) {
    var safePath = String(path || '/');
    if (safePath === ROUTES.DASHBOARD) {
        return 'orders';
    }
    if (safePath === ROUTES.INVOICES) {
        return 'invoices';
    }
    if (safePath === ROUTES.CREATE_ORDER) {
        return 'create-order';
    }
    if (safePath.indexOf('/orders/') === 0) {
        return 'order-detail';
    }
    if (safePath.indexOf('/invoices/') === 0) {
        return 'invoice-detail';
    }
    return safePath.replace(/^\//, '') || 'orders';
}

function logRouteDiagnostics(details) {
    var safeDetails = details || {};
    console.info('[ROUTE] requested: ' + (safeDetails.requested || ''));
    console.info('[ROUTE] mounted: ' + (safeDetails.mounted || ''));
    console.info('[ROUTE] redirected: ' + (safeDetails.redirected === true));
    console.info('[ROUTE] fallbackUsed: ' + (safeDetails.fallbackUsed === true));
    if (safeDetails.source) {
        console.info('[ROUTE] source: ' + safeDetails.source);
    }
    if (safeDetails.reason) {
        console.info('[ROUTE] reason: ' + safeDetails.reason);
    }
}

function renderRouteError(path, message) {
    const container = document.getElementById('page-container');
    if (!container) {
        return;
    }
    const routeName = getRouteName(path);
    container.innerHTML = '<section class="card animate-fade-in" style="border-color: #fecaca; background: #fff7f7; color: #7f1d1d; padding: 18px;">'
        + '<div style="font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: .06em; color: #991b1b;">' + escapeHtml(routeName) + '</div>'
        + '<h2 style="font-size: 18px; margin: 6px 0 6px;">Could not open this page.</h2>'
        + '<p style="font-size: 13px; margin: 0;">' + escapeHtml(message || 'The route stayed here so the error can be fixed without sending you back to Orders.') + '</p>'
        + '</section>';
}


class Router {
    constructor() {
        this.routes = {};
        this.lastNavigateAt = 0;
        this.lastNavigateRoute = '';
        window.addEventListener('hashchange', this.handleLocationChange.bind(this));

        // Intercept links starting with #/
        const routerInstance = this;
        document.addEventListener('click', function(e) {
            const link = e.target.closest('a');
            if (link) {
                const href = link.getAttribute('href');
                // Only intercept internal relative or hash links
                if (href && (href.startsWith('#/') || (href.startsWith('/') && !href.startsWith('//')))) {
                    e.preventDefault();
                    routerInstance.navigate(href.startsWith('#') ? href.slice(1) : href);
                }
            }
        });
    }

    addRoute(path, viewHandler) {
        this.routes[path] = viewHandler;
    }

    async navigate(path, options) {
        var safeOptions = options || {};
        var normalizedPath = normalizePath(path || '/');
        var routeName = getRouteName(normalizedPath);
        var currentPath = window.location.hash.slice(1) || '/';
        var now = Date.now();

        if (currentPath === normalizedPath && safeOptions.force !== true) {
            console.info('[NAV_CLICK] route=' + routeName + ' ignored reason=already-active');
            return;
        }

        if (this.lastNavigateRoute === routeName && now - this.lastNavigateAt < 300 && safeOptions.force !== true) {
            console.info('[NAV_CLICK] route=' + routeName + ' ignored reason=debounced');
            return;
        }

        this.lastNavigateRoute = routeName;
        this.lastNavigateAt = now;
        console.info('[NAV_CLICK] route=' + routeName + ' accepted=true');

        // Always navigate using hash for better subfolder support
        window.location.hash = normalizedPath;
    }

    async handleLocationChange() {
        let path = window.location.hash.slice(1) || '/';

        // Normalize any weird double slashes
        if (path.startsWith('//')) path = path.slice(1);

        // =========================
        // AUTH GUARD
        // =========================
        const isPublicRoute = PUBLIC_ROUTES.some(route => {
            if (route === path) return true;
            if (!route.includes(':')) return false;
            const routeParts = route.split('/').filter(Boolean);
            const pathParts = path.split('/').filter(Boolean);
            return routeParts.length === pathParts.length && routeParts.every((part, index) => part.startsWith(':') || part === pathParts[index]);
        });

        if (!isPublicRoute && !guardService.canActivate(path)) {
            logRouteDiagnostics({ requested: getRouteName(path), mounted: 'login', redirected: true, fallbackUsed: false, source: 'auth-guard' });
            return this.navigate(ROUTES.LOGIN);
        }

        if (path === ROUTES.LOGIN && authService.getCurrentUser() && authService.isAdmin()) {
            logRouteDiagnostics({ requested: 'login', mounted: 'orders', redirected: true, fallbackUsed: false, source: 'auth-guard' });
            return this.navigate(ROUTES.DASHBOARD);
        }

        // =========================
        // ROUTE MATCHING
        // =========================
        let matchedRoute = null;
        let params = {};

        for (const routePath in this.routes) {
            // Exact match
            if (routePath === path) {
                matchedRoute = routePath;
                break;
            }

            // Param match: /orders/:id
            if (routePath.includes(':')) {
                const routeParts = routePath.split('/').filter(p => p);
                const pathParts = path.split('/').filter(p => p);

                if (routeParts.length === pathParts.length) {
                    let isMatch = true;
                    let tempParams = {};

                    for (let i = 0; i < routeParts.length; i++) {
                        if (routeParts[i].startsWith(':')) {
                            tempParams[routeParts[i].slice(1)] = pathParts[i];
                        } else if (routeParts[i] !== pathParts[i]) {
                            isMatch = false;
                            break;
                        }
                    }

                    if (isMatch) {
                        matchedRoute = routePath;
                        params = tempParams;
                        break;
                    }
                }
            }
        }

        // =========================
        // RENDER
        // =========================
        if (matchedRoute) {
            var requestedRouteName = getRouteName(path);
            var mountedRouteName = getRouteName(matchedRoute);
            var navigationId = beginNavigation(requestedRouteName, path);
            try {
                await this.routes[matchedRoute](params, {
                    navigationId: navigationId,
                    routeName: requestedRouteName,
                    path: path
                });
                if (!isNavigationStillCurrent(navigationId, requestedRouteName)) {
                    ignoreStaleRouteResult('route-handler-finished-after-navigation', requestedRouteName, navigationId);
                    return;
                }
                logAppliedRouteRender(requestedRouteName, navigationId);
                logRouteDiagnostics({ requested: requestedRouteName, mounted: mountedRouteName, redirected: false, fallbackUsed: false, source: 'real-view' });
            } catch (err) {
                console.error("View Render Error:", err);
                if (!isNavigationStillCurrent(navigationId, requestedRouteName)) {
                    ignoreStaleRouteResult('route-error-after-navigation', requestedRouteName, navigationId);
                    return;
                }
                renderRouteError(path, 'This page could not finish loading. Cached data stays visible when available; retry when the connection improves.');
                logRouteDiagnostics({ requested: requestedRouteName, mounted: 'error', redirected: false, fallbackUsed: false, source: 'route-error', reason: err && err.message ? err.message : 'render failed' });
            }
        } else {
            console.warn("No route found for", path);
            renderRouteError(path, 'This route is not registered in the current app version. No Orders fallback was used.');
            logRouteDiagnostics({ requested: getRouteName(path), mounted: 'error', redirected: false, fallbackUsed: false, source: 'unknown-route', reason: 'route not registered' });
        }
    }
}

export const router = new Router();
