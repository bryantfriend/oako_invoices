/**
 * Simple centralized state management (Pub/Sub pattern)
 */
class Store {
    constructor() {
        this.state = {
            currentUser: null,
            isAdmin: false,
            orders: [],
            invoices: [],
            theme: 'light',
            uiLoading: false
        };
        this.listeners = new Set();
    }

    /**
     * Get current state
     */
    getState() {
        return { ...this.state };
    }

    /**
     * Update state and notify listeners
     * @param {Object} partialState 
     */
    setState(partialState) {
        this.state = { ...this.state, ...partialState };
        this.notify();
    }

    /**
     * Subscribe to state changes
     * @param {Function} listener 
     * @returns {Function} unsubscribe function
     */
    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    notify() {
        this.listeners.forEach(listener => listener(this.state));
    }
}

export const store = new Store();
