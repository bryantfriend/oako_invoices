import { ROUTES } from "./core/constants.js";
import { guardService } from "./core/guardService.js";
import { authService } from "./core/authService.js";

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
        if (path !== ROUTES.LOGIN && !guardService.canActivate(path)) {
            if (authService.getCurrentUser() === null) {
                return this.navigate(ROUTES.LOGIN);
            }
        }

        if (path === ROUTES.LOGIN && authService.getCurrentUser()) {
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
                this.navigate(ROUTES.DASHBOARD);
            }
        } else {
            console.warn("No route found for", path);
            this.navigate(ROUTES.DASHBOARD);
        }
    }
}

export const router = new Router();
