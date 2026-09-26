import resultHelpers from '../../../engine/resultHelpers.js';
import { parseProductionQuantity } from '../../../../core/inventoryValidation.js';
function normalizeInventoryMutation(intent) {
    intent.payload.entries = intent.payload.entries.map(function normalizeEntry(entry) {
        var data = Object.assign({}, entry.data);
        if (data.totalBaked !== undefined) data.totalBaked = parseProductionQuantity(data.totalBaked);
        return { productId: entry.productId, data: data };
    });
    return resultHelpers.success(intent);
}
export default { normalizeInventoryMutation: normalizeInventoryMutation };
