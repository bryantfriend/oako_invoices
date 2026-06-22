export const SYNC_RETRY_STATUSES = {
    PENDING: 'pending',
    SYNCING: 'syncing',
    RETRY_WAIT: 'retry_wait',
    BLOCKED_AUTHENTICATION: 'blocked_authentication',
    CONFLICT: 'conflict',
    FAILED_TERMINAL: 'failed_terminal',
    ACKNOWLEDGED: 'acknowledged'
};

const RETRYABLE_CODES = [
    'unavailable',
    'deadline-exceeded',
    'resource-exhausted',
    'aborted'
];

const TERMINAL_CODES = [
    'permission-denied',
    'invalid-argument',
    'not-found',
    'failed-precondition'
];

function getErrorCode(error) {
    if (!error) {
        return '';
    }
    return String(error.code || error.name || '').toLowerCase();
}

function getErrorMessage(error) {
    if (!error) {
        return '';
    }
    if (error.message) {
        return String(error.message);
    }
    return String(error);
}

function containsAny(value, candidates) {
    for (var index = 0; index < candidates.length; index += 1) {
        if (value.indexOf(candidates[index]) !== -1) {
            return true;
        }
    }
    return false;
}

export function classifySyncError(error) {
    var code = getErrorCode(error);
    var message = getErrorMessage(error).toLowerCase();

    if (message.indexOf('sync_conflict') !== -1 || code === 'sync_conflict') {
        return {
            status: SYNC_RETRY_STATUSES.CONFLICT,
            retryable: false,
            code: 'sync_conflict',
            message: getErrorMessage(error)
        };
    }

    if (code === 'unauthenticated' || message.indexOf('auth') !== -1 && message.indexOf('expired') !== -1) {
        return {
            status: SYNC_RETRY_STATUSES.BLOCKED_AUTHENTICATION,
            retryable: false,
            code: code || 'unauthenticated',
            message: getErrorMessage(error)
        };
    }

    if (containsAny(code, TERMINAL_CODES)) {
        return {
            status: SYNC_RETRY_STATUSES.FAILED_TERMINAL,
            retryable: false,
            code: code,
            message: getErrorMessage(error)
        };
    }

    if (
        containsAny(code, RETRYABLE_CODES) ||
        message.indexOf('network') !== -1 ||
        message.indexOf('timeout') !== -1 ||
        message.indexOf('temporarily unavailable') !== -1 ||
        message.indexOf('503') !== -1 ||
        message.indexOf('500') !== -1 ||
        message.indexOf('429') !== -1
    ) {
        return {
            status: SYNC_RETRY_STATUSES.RETRY_WAIT,
            retryable: true,
            code: code || 'retryable',
            message: getErrorMessage(error)
        };
    }

    return {
        status: SYNC_RETRY_STATUSES.FAILED_TERMINAL,
        retryable: false,
        code: code || 'unknown',
        message: getErrorMessage(error)
    };
}

export function calculateRetryDelayMilliseconds(attemptCount, jitterValue) {
    var safeAttempt = Math.max(1, Number(attemptCount) || 1);
    var safeJitter = Number(jitterValue);
    if (!Number.isFinite(safeJitter)) {
        safeJitter = Math.random();
    }
    if (safeJitter < 0) {
        safeJitter = 0;
    }
    if (safeJitter > 1) {
        safeJitter = 1;
    }

    var baseDelay = 1000;
    var maxDelay = 5 * 60 * 1000;
    var exponentialDelay = baseDelay * Math.pow(2, Math.min(safeAttempt - 1, 8));
    var jitter = Math.floor(exponentialDelay * 0.25 * safeJitter);
    return Math.min(maxDelay, exponentialDelay + jitter);
}

export function getNextRetryIsoString(attemptCount, nowMillis, jitterValue) {
    var baseMillis = Number(nowMillis) || Date.now();
    var delay = calculateRetryDelayMilliseconds(attemptCount, jitterValue);
    return new Date(baseMillis + delay).toISOString();
}
