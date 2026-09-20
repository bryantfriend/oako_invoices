import resultHelpers from '../../../engine/resultHelpers.js';

async function processRetrySync(intent) {
    var api = intent.context.retryApi;
    await api.verifyAuthentication(intent.context.session.uid);
    var count = await api.requeue(intent.context.items, intent.context.session.uid, intent.payload.mode);
    intent.context.retryResult = { requeued: count };
    return resultHelpers.success(intent);
}

export default { processRetrySync: processRetrySync };
