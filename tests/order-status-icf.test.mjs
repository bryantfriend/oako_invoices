import test from 'node:test';
import assert from 'node:assert/strict';

import icfPipeline from '../js/ICF/engine/pipeline.js';
import validateUpdateOrderStatusPayloadModule from '../js/ICF/Stages/Validators/Orders/validateUpdateOrderStatusPayload.js';
import normalizeUpdateOrderStatusPayloadModule from '../js/ICF/Stages/Normalizers/Orders/normalizeUpdateOrderStatusPayload.js';
import authorizeOrderMutationModule from '../js/ICF/Stages/Authorizers/Orders/authorizeOrderMutation.js';
import processUpdateOrderStatusModule from '../js/ICF/Stages/Processors/Orders/processUpdateOrderStatus.js';
import emitUpdateOrderStatusResultModule from '../js/ICF/Stages/Emitters/Orders/emitUpdateOrderStatusResult.js';

function createIntent(actor, payload) {
    return {
        type: 'UpdateOrderStatusIntent',
        actor,
        payload,
        context: {},
        stages: {
            Validate: {
                validateUpdateOrderStatusPayload:
                    validateUpdateOrderStatusPayloadModule.validateUpdateOrderStatusPayload
            },
            Normalize: {
                normalizeUpdateOrderStatusPayload:
                    normalizeUpdateOrderStatusPayloadModule.normalizeUpdateOrderStatusPayload
            },
            AddContext: {
                passAddContext: function(intent) {
                    return { ok: true, intent };
                }
            },
            Authorize: {
                authorizeOrderMutation:
                    authorizeOrderMutationModule.authorizeOrderMutation
            },
            Process: {
                processUpdateOrderStatus:
                    processUpdateOrderStatusModule.processUpdateOrderStatus
            },
            Emit: {
                emitUpdateOrderStatusResult:
                    emitUpdateOrderStatusResultModule.emitUpdateOrderStatusResult
            }
        }
    };
}

test('UpdateOrderStatusIntent normalizes and processes order status updates', async function() {
    const calls = [];
    const intent = createIntent({
        id: 'admin@example.com',
        role: 'admin'
    }, {
        orderId: 'order-123',
        status: ' PAID ',
        orderApi: {
            updateOrderStatusDirect: async function(orderId, status) {
                calls.push({ orderId, status });
                return true;
            }
        }
    });

    const result = await icfPipeline.run(intent);

    assert.equal(result.ok, true);
    assert.deepEqual(calls, [{ orderId: 'order-123', status: 'paid' }]);
    assert.equal(result.intent.context.resultData.orderId, 'order-123');
    assert.equal(result.intent.context.resultData.status, 'paid');
    assert.equal(result.intent.context.events[0].type, 'OrderStatusUpdated');
});

test('UpdateOrderStatusIntent rejects unsupported actors and statuses', async function() {
    const orderApi = {
        updateOrderStatusDirect: async function() {
            throw new Error('Should not update order');
        }
    };
    const unauthorizedIntent = createIntent({
        id: 'viewer@example.com',
        role: 'viewer'
    }, {
        orderId: 'order-123',
        status: 'paid',
        orderApi
    });
    const invalidStatusIntent = createIntent({
        id: 'admin@example.com',
        role: 'admin'
    }, {
        orderId: 'order-123',
        status: 'not-a-status',
        orderApi
    });

    const unauthorizedResult = await icfPipeline.run(unauthorizedIntent);
    const invalidStatusResult = await icfPipeline.run(invalidStatusIntent);

    assert.equal(unauthorizedResult.ok, false);
    assert.equal(unauthorizedResult.stage, 'Authorize');
    assert.equal(invalidStatusResult.ok, false);
    assert.equal(invalidStatusResult.stage, 'Validate');
});