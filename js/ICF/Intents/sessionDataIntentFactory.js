function createSessionActor(actor) {
    if (!actor) {
        return {
            id: 'anonymous',
            role: 'anonymous'
        };
    }

    return actor;
}

function createSessionPayload(payload, collectionName, actionName) {
    var source = payload || {};

    return Object.assign({}, source, {
        collectionName: collectionName,
        actionName: actionName
    });
}

function validateSessionDataPayload(intent) {
    var errors = [];

    if (!intent.payload) {
        errors.push('Session data payload is required.');
    }

    if (intent.payload && !intent.payload.collectionName) {
        errors.push('Session data collection name is required.');
    }

    if (intent.payload && !intent.payload.actionName) {
        errors.push('Session data action name is required.');
    }

    if (intent.payload && !intent.payload.storeApi) {
        errors.push('Session data store API is required.');
    }

    if (errors.length > 0) {
        return {
            ok: false,
            errors: errors
        };
    }

    return {
        ok: true,
        intent: intent
    };
}

function normalizeSessionDataPayload(intent) {
    var payload = Object.assign({}, intent.payload || {});
    var options = payload.options || {};

    payload.collectionName = String(payload.collectionName || '').trim();
    payload.actionName = String(payload.actionName || '').trim();
    payload.options = Object.assign({}, options);

    return {
        ok: true,
        intent: Object.assign({}, intent, {
            payload: payload
        })
    };
}

function addSessionDataContext(intent) {
    var context = Object.assign({}, intent.context || {}, {
        requestedAt: Date.now(),
        source: intent.payload.options.source || 'ui',
        collectionName: intent.payload.collectionName,
        actionName: intent.payload.actionName
    });

    return {
        ok: true,
        intent: Object.assign({}, intent, {
            context: context
        })
    };
}

function authorizeSessionDataAccess(intent) {
    var actor = intent.actor || {};
    var role = actor.role || '';

    if (role !== 'admin' && role !== 'superadmin') {
        return {
            ok: false,
            errors: [
                'Only admins can load session business data.'
            ]
        };
    }

    return {
        ok: true,
        intent: intent
    };
}

async function processSessionDataIntent(intent) {
    var payload = intent.payload || {};
    var storeApi = payload.storeApi;
    var data = await storeApi.processSessionIntent({
        type: intent.type,
        collectionName: payload.collectionName,
        actionName: payload.actionName,
        options: payload.options || {},
        actor: intent.actor || {},
        requestedAt: intent.context ? intent.context.requestedAt : Date.now()
    });
    var context = Object.assign({}, intent.context || {}, {
        resultData: data
    });

    return {
        ok: true,
        intent: Object.assign({}, intent, {
            context: context
        })
    };
}

function emitSessionDataResult(intent) {
    var context = Object.assign({}, intent.context || {});
    var events = context.events || [];

    events.push({
        type: intent.type + 'Completed',
        collectionName: context.collectionName,
        actionName: context.actionName,
        emittedAt: Date.now()
    });

    context.events = events;

    return {
        ok: true,
        intent: Object.assign({}, intent, {
            context: context
        })
    };
}

function createSessionDataIntent(intentType, collectionName, actionName, actor, payload, options) {
    return {
        type: intentType,
        actor: createSessionActor(actor),
        payload: createSessionPayload(payload, collectionName, actionName),
        context: {
            options: options || {}
        },
        stages: {
            Validate: {
                validateSessionDataPayload: validateSessionDataPayload
            },
            Normalize: {
                normalizeSessionDataPayload: normalizeSessionDataPayload
            },
            AddContext: {
                addSessionDataContext: addSessionDataContext
            },
            Authorize: {
                authorizeSessionDataAccess: authorizeSessionDataAccess
            },
            Process: {
                processSessionDataIntent: processSessionDataIntent
            },
            Emit: {
                emitSessionDataResult: emitSessionDataResult
            }
        }
    };
}

export default {
    createSessionDataIntent: createSessionDataIntent
};