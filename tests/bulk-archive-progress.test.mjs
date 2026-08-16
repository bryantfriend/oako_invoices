import test from 'node:test';
import assert from 'node:assert/strict';
import processorModule from '../js/ICF/Stages/Processors/Orders/processArchiveSelectedOrders.js';

test('bulk archive retries, limits concurrency, and reaches 100 after confirmed archives', async function() {
    const attempts = {};
    const progress = [];
    let active = 0;
    let maximumActive = 0;
    const intent = {
        payload: { orderIds: ['a', 'b', 'c', 'd', 'e'] },
        context: {
            archiveApi: {
                archiveOrder: async function(orderId) {
                    attempts[orderId] = (attempts[orderId] || 0) + 1;
                    active += 1;
                    maximumActive = Math.max(maximumActive, active);
                    await new Promise(function(resolve) {
                        setTimeout(resolve, 5);
                    });
                    active -= 1;
                    if (orderId === 'c' && attempts[orderId] === 1) {
                        throw new Error('temporary failure');
                    }
                    return { archived: true };
                }
            },
            onProgress: function(value) {
                progress.push(value);
            }
        }
    };

    const result = await processorModule.processArchiveSelectedOrders(intent);
    const data = result.intent.context.archiveSelectedOrdersResult;

    assert.equal(result.ok, true);
    assert.equal(data.complete, true);
    assert.equal(data.archived, 5);
    assert.equal(data.failed, 0);
    assert.equal(attempts.c, 2);
    assert.ok(maximumActive <= 3);
    assert.equal(progress.at(-1).percent, 100);
});

test('bulk archive reports permanent failures and never shows false 100 percent', async function() {
    const attempts = {};
    const progress = [];
    const intent = {
        payload: { orderIds: ['ok-1', 'fail', 'ok-2'] },
        context: {
            archiveApi: {
                archiveOrder: async function(orderId) {
                    attempts[orderId] = (attempts[orderId] || 0) + 1;
                    if (orderId === 'fail') {
                        throw new Error('permission denied');
                    }
                    return { archived: true };
                }
            },
            onProgress: function(value) {
                progress.push(value);
            }
        }
    };

    const result = await processorModule.processArchiveSelectedOrders(intent);
    const data = result.intent.context.archiveSelectedOrdersResult;

    assert.equal(data.complete, false);
    assert.equal(data.archived, 2);
    assert.equal(data.failed, 1);
    assert.equal(attempts.fail, 2);
    assert.equal(data.failures[0].orderId, 'fail');
    assert.ok(progress.every(function(value) {
        return value.percent < 100;
    }));
});

test('bulk archive treats already archived orders as skipped idempotent successes', async function() {
    const result = await processorModule.processArchiveSelectedOrders({
        payload: { orderIds: ['already', 'new'] },
        context: {
            archiveApi: {
                archiveOrder: async function(orderId) {
                    return orderId === 'already'
                        ? { archived: true, transitioned: false }
                        : { archived: true, transitioned: true };
                }
            }
        }
    });

    const data = result.intent.context.archiveSelectedOrdersResult;
    assert.equal(data.archived, 1);
    assert.equal(data.skippedCount, 1);
    assert.equal(data.complete, true);
});
