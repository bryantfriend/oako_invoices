import resultHelpers from "../../../engine/resultHelpers.js";

async function processArchiveSelectedOrders(intent) {
  var orderIds = intent.payload.orderIds;
  var archiveApi = intent.context.archiveApi;
  var onProgress = intent.context.onProgress;
  var succeeded = [];
  var failed = [];
  var nextIndex = 0;
  var completed = 0;

  notifyProgress(onProgress, {
    completed: 0,
    archived: 0,
    failed: 0,
    total: orderIds.length,
    percent: 0,
    message: "Starting archive..."
  });

  async function runWorker() {
    while (nextIndex < orderIds.length) {
      var currentIndex = nextIndex;
      nextIndex = nextIndex + 1;
      var orderId = orderIds[currentIndex];
      var archiveResult = await archiveWithRetry(archiveApi, orderId);
      if (archiveResult.ok) {
        succeeded.push({
          orderId: orderId,
          result: archiveResult.result
        });
      } else {
        failed.push({
          orderId: orderId,
          message: archiveResult.message
        });
      }
      completed = completed + 1;
      notifyProgress(onProgress, {
        orderId: orderId,
        ok: archiveResult.ok,
        result: archiveResult.result,
        message: archiveResult.ok ? "Archived " + String(succeeded.length) + " of " + String(orderIds.length) + " orders" : "Could not archive order " + orderId,
        completed: completed,
        archived: succeeded.length,
        failed: failed.length,
        total: orderIds.length,
        percent: Math.round((succeeded.length / orderIds.length) * 100)
      });
    }
  }

  var workers = [];
  var workerCount = Math.min(3, orderIds.length);
  var workerIndex = 0;
  while (workerIndex < workerCount) {
    workers.push(runWorker());
    workerIndex = workerIndex + 1;
  }
  await Promise.all(workers);

  var updatedIntent = resultHelpers.addContextValue(intent, "archiveSelectedOrdersResult", {
    requested: orderIds.length,
    archived: succeeded.length,
    failed: failed.length,
    succeeded: succeeded,
    failures: failed,
    complete: failed.length === 0
  });
  return resultHelpers.success(updatedIntent);
}

async function archiveWithRetry(archiveApi, orderId) {
  var attempt = 0;
  var lastError = null;
  while (attempt < 2) {
    try {
      var result = await archiveApi.archiveOrder(orderId);
      return { ok: true, result: result };
    } catch (error) {
      lastError = error;
      attempt = attempt + 1;
    }
  }
  return {
    ok: false,
    message: lastError && lastError.message ? lastError.message : "Archive failed."
  };
}

function notifyProgress(callback, progress) {
  if (typeof callback !== "function") {
    return;
  }
  try {
    callback(progress);
  } catch (error) {
    console.warn("Archive progress callback failed.", error);
  }
}

export default {
  processArchiveSelectedOrders: processArchiveSelectedOrders
};
