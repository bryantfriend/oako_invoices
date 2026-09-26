import resultHelpers from '../../../engine/resultHelpers.js';
async function processInventoryMutation(intent) {
    var payload = intent.payload;
    var results = [];
    // Each product is an independent transaction. Report partial success explicitly.
    for (var index = 0; index < payload.entries.length; index += 1) {
        var entry = payload.entries[index];
        try {
            var saved = await payload.writeRecord(payload.date, entry.productId, entry.data, payload.onlyUninitialized === true);
            if (saved === false) throw new Error('The save was not acknowledged.');
            results.push({ productId: entry.productId, ok: true });
        } catch (error) {
            results.push({ productId: entry.productId, ok: false, error: error.message || 'Could not save this product.' });
        }
    }
    intent.context.inventoryResults = results;
    return resultHelpers.success(intent);
}
export default { processInventoryMutation: processInventoryMutation };
