import { createInventoryIntent } from './inventoryIntentFactory.js';
export function createImportInventoryDayIntent(payload) {
    return createInventoryIntent('ImportInventoryDayIntent', payload);
}
