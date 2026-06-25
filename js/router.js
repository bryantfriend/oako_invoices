import { ROUTES } from "./core/constants.js";
import { guardService } from "./core/guardService.js";
import { authService } from "./core/authService.js";

const PUBLIC_ROUTES = [ROUTES.LOGIN, ROUTES.MOBILE_INVOICE, ROUTES.MOBILE_INVOICE_MODE];

function normalizePath(path) {
    if (path === '/index.html') return '/';
    return path;
}


class Router {
    constructor() {
        this.routes = {};
        window.addEventListener('hashchange', this.handleLocationChange.bind(this));

        // Intercept links starting with #/
        document.addEventListener('click', (e) => {
            const link = e.target.closest('a');
            if (link) {
                const href = link.getAttribute('href');
                // Only intercept internal relative or hash links
                if (href && (href.startsWith('#/') || (href.startsWith('/') && !href.startsWith('//')))) {
                    // Normalize slash links to hash links
                    if (href.startsWith('/')) {
                        e.preventDefault();
                        this.navigate(href);
                    }
                }
            }
        });
    }

    addRoute(path, viewHandler) {
        this.routes[path] = viewHandler;
    }

    async navigate(path) {
        // Always navigate using hash for better subfolder support
        window.location.hash = path;
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
            return this.navigate(ROUTES.LOGIN);
        }

        if (path === ROUTES.LOGIN && authService.getCurrentUser() && authService.isAdmin()) {
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
            try {
                await this.routes[matchedRoute](params);
            } catch (err) {
                console.error("View Render Error:", err);
                const container = document.getElementById('page-container');
                if (container) {
                    container.innerHTML = '<div class="card" style="border-color: #fecaca; background: #fff7f7; color: #7f1d1d;"><strong>Could not open this page.</strong><br><span style="font-size: 13px;">The route stayed here so the error can be fixed without sending you back to Orders.</span></div>';
                }
            }
        } else {
            console.warn("No route found for", path);
            this.navigate(ROUTES.DASHBOARD);
        }
    }
}

export const router = new Router();
