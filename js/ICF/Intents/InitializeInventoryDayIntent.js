import { createInventoryIntent } from './inventoryIntentFactory.js';
export function createInitializeInventoryDayIntent(payload) {
    return createInventoryIntent('InitializeInventoryDayIntent', payload);
}
