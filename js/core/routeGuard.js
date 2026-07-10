var routerState = {
    currentRoute: '',
    currentPath: '',
    navigationId: 0
};

function beginNavigation(routeName, path) {
    routerState.currentRoute = routeName || '';
    routerState.currentPath = path || '';
    routerState.navigationId = routerState.navigationId + 1;
    console.info('[ROUTE_GUARD] started route=' + routerState.currentRoute + ' navigationId=' + routerState.navigationId);
    return routerState.navigationId;
}

function getCurrentNavigationId() {
    return routerState.navigationId;
}

function getCurrentRoute() {
    return routerState.currentRoute;
}

function getCurrentPath() {
    return routerState.currentPath;
}

function isNavigationStillCurrent(navigationId, routeName) {
    return Number(navigationId) === routerState.navigationId && String(routeName || '') === routerState.currentRoute;
}

function ignoreStaleRouteResult(reason, routeName, navigationId) {
    console.info('[ROUTE_GUARD] ignored stale render route=' + (routeName || '') +
        ' navigationId=' + navigationId +
        ' currentRoute=' + routerState.currentRoute +
        ' currentNavigationId=' + routerState.navigationId +
        (reason ? ' reason=' + reason : ''));
}

function logAppliedRouteRender(routeName, navigationId) {
    console.info('[ROUTE_GUARD] applied render route=' + (routeName || '') + ' navigationId=' + navigationId);
}

export {
    beginNavigation,
    getCurrentNavigationId,
    getCurrentRoute,
    getCurrentPath,
    isNavigationStillCurrent,
    ignoreStaleRouteResult,
    logAppliedRouteRender
};
