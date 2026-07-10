var singleFlightPromises = {};

function runSingleFlight(key, worker, options) {
    var safeOptions = options || {};
    var safeKey = String(key || 'default');

    if (singleFlightPromises[safeKey] && safeOptions.force !== true) {
        console.info('[SINGLE_FLIGHT] reused key=' + safeKey);
        return singleFlightPromises[safeKey];
    }

    console.info('[SINGLE_FLIGHT] started key=' + safeKey);
    singleFlightPromises[safeKey] = Promise.resolve()
        .then(worker)
        .then(function(result) {
            console.info('[SINGLE_FLIGHT] completed key=' + safeKey);
            return result;
        })
        .catch(function(error) {
            console.info('[SINGLE_FLIGHT] completed key=' + safeKey + ' status=error');
            throw error;
        })
        .finally(function() {
            delete singleFlightPromises[safeKey];
        });

    return singleFlightPromises[safeKey];
}

function hasSingleFlight(key) {
    return !!singleFlightPromises[String(key || 'default')];
}

export {
    runSingleFlight,
    hasSingleFlight
};
