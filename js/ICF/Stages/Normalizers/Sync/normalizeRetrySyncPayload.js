import resultHelpers from '../../../engine/resultHelpers.js';

function normalizeRetrySyncPayload(intent) {
    intent.payload.itemIds = Array.from(new Set(intent.payload.itemIds.map(function(id) { return id.trim(); })));
    return resultHelpers.success(intent);
}

export default { normalizeRetrySyncPayload: normalizeRetrySyncPayload };
