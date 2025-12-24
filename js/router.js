import { ROUTES } from "./core/constants.js";
import { guardService } from "./core/guardService.js";
import { authService } from "./core/authService.js";

// Detect base path (e.g., /oako_invoices)
const BASE_PATH = window.location.pathname.startsWith('/oako_invoices') ? '/oako_invoices' : '';

function normalizePath(path) {
    let normalized = path;
    // Strip base path if present
    if (BASE_PATH && normalized.startsWith(BASE_PATH)) {
        normalized = normalized.substring(BASE_PATH.length);
    }
    // Handle root or index.html
    if (normalized === '/index.html' || normalized === '') return '/';
    return normalized;
}


class Router {
    constructor() {
        this.routes = {};
        this.currentPath = window.location.pathname;
        window.addEventListener('popstate', this.handleLocationChange.bind(this));

        // Intercept links
        document.addEventListener('click', (e) => {
            if (e.target.matches('a') || e.target.closest('a')) {
                const link = e.target.matches('a') ? e.target : e.target.closest('a');
                const href = link.getAttribute('href');

                // If the link has the base path, strip it for internal navigation logic
                // But generally we expect internal links to be written typically as "/" or "/orders"

                if (href && href.startsWith('/')) {
                    e.preventDefault();
                    this.navigate(href);
                }
            }
        });
    }

    addRoute(path, viewHandler) {
        this.routes[path] = viewHandler;
    }

    async navigate(path) {
        // Ensure path starts with /
        const route = path.startsWith('/') ? path : '/' + path;

        // Prepend base path for history
        const fullPath = (BASE_PATH === '/' ? '' : BASE_PATH) + route;

        window.history.pushState({}, '', fullPath);
        await this.handleLocationChange();
    }

    async handleLocationChange() {
        let path = normalizePath(window.location.pathname);

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
                const routeParts = routePath.split('/');
                const pathParts = path.split('/');

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
            await this.routes[matchedRoute](params);
        } else {
            console.warn("No route found for", path);
            this.navigate(ROUTES.DASHBOARD);
        }
    }
}

export const router = new Router();
