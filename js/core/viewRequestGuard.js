import { getCurrentNavigationId, getCurrentRoute, isNavigationStillCurrent } from './routeGuard.js';

export function createViewRequestGuard() {
    var generation = 0;
    return function beginViewRequest(container) {
        generation += 1;
        var request = generation;
        var navigationId = getCurrentNavigationId();
        var route = getCurrentRoute();
        return function isCurrentViewRequest() {
            return request === generation && document.getElementById('page-container') === container && isNavigationStillCurrent(navigationId, route);
        };
    };
}
