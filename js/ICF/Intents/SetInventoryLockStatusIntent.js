import { createInventoryIntent } from './inventoryIntentFactory.js';
export function createSetInventoryLockStatusIntent(payload) {
    return createInventoryIntent('SetInventoryLockStatusIntent', payload);
}
