import { createInventoryIntent } from './inventoryIntentFactory.js';
import processors from '../Stages/Processors/processors.js';
export function createSaveInventoryDefaultsIntent(payload) {
    var intent = createInventoryIntent('SaveInventoryDefaultsIntent', payload);
    intent.stages.Process = { processInventoryDefaults: processors.processInventoryDefaults };
    return intent;
}
