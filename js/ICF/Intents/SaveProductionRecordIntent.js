import { createInventoryIntent } from './inventoryIntentFactory.js';
export function createSaveProductionRecordIntent(payload) {
    return createInventoryIntent('SaveProductionRecordIntent', payload);
}
