import resultHelpers from '../../../engine/resultHelpers.js';
import { validateInventoryEntry } from '../../../../core/inventoryValidation.js';
function validateInventoryMutation(intent) {
    try {
        var payload = intent.payload;
        if (!Array.isArray(payload.entries) || !payload.entries.length) throw new Error('No inventory records to save or import.');
        payload.entries.forEach(function validateEntry(entry) { validateInventoryEntry(payload.date, entry.productId, entry.data); });
        if (intent.type === 'SaveInventoryDefaultsIntent') {
            if (typeof payload.writeDefaults !== 'function') throw new Error('Inventory defaults writer is required.');
            payload.entries.forEach(function requireDefaultQuantity(entry) {
                if (entry.data.totalBaked === undefined) throw new Error('A starting quantity is required.');
            });
        } else if (typeof payload.writeRecord !== 'function') throw new Error('Inventory writer is required.');
        return resultHelpers.success(intent);
    } catch (error) { return resultHelpers.validationFailure([error.message]); }
}
export default { validateInventoryMutation: validateInventoryMutation };
