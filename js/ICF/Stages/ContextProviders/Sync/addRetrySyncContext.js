import resultHelpers from '../../../engine/resultHelpers.js';

async function addRetrySyncContext(intent) {
    var api = intent.context.retryApi;
    intent.context.session = api.getSession();
    intent.context.items = await api.loadItems(intent.payload.itemIds);
    return resultHelpers.success(intent);
}

export default { addRetrySyncContext: addRetrySyncContext };
