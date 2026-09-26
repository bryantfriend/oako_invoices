import resultHelpers from '../../../engine/resultHelpers.js';
async function processInventoryDefaults(intent) {
    // Defaults share one settings document; save the entire change atomically.
    await intent.payload.writeDefaults(intent.payload.entries);
    intent.context.inventoryResults = intent.payload.entries.map(function savedDefault(entry) {
        return { productId: entry.productId, ok: true };
    });
    return resultHelpers.success(intent);
}
export default { processInventoryDefaults: processInventoryDefaults };
