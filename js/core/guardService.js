import { store } from "./store.js";

export const guardService = {
    /**
     * Checks if route requires auth and if user is permitted
     * @returns {boolean}
     */
    canActivate: (routePath) => {
        const state = store.getState();
        const user = state.currentUser;

        // Public routes
        if (routePath === '/login') {
            return !user; // If logged in, shouldn't go to login
        }

        // Protected routes
        return !!user && state.isAdmin === true;
    }
};
