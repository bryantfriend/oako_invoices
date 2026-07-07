export function isArchivedRecord(record) {
    return !!(record && (record.archived === true || String(record.status || '').toLowerCase() === 'archived'));
}

export function getAnalyticsStatus(record) {
    var source = record || {};
    var status = String(source.status || '').toLowerCase();
    if (status === 'archived' && source.previousStatus) {
        return String(source.previousStatus).toLowerCase();
    }
    return status;
}

export function shouldIncludeRecordInAnalytics(record, analyticsOptions) {
    var options = analyticsOptions || {};
    if (!record) {
        return false;
    }
    if (options.includeArchived === true) {
        return true;
    }
    return !isArchivedRecord(record);
}

export function getMillis(value) {
    if (!value) {
        return 0;
    }
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? 0 : value.getTime();
    }
    if (typeof value.toDate === 'function') {
        var timestampDate = value.toDate();
        return timestampDate && !Number.isNaN(timestampDate.getTime()) ? timestampDate.getTime() : 0;
    }
    if (value.seconds) {
        return Number(value.seconds) * 1000;
    }
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : 0;
    }
    var parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

export function getRecordActivityTimestamp(record) {
    var source = record || {};
    return Math.max(
        getMillis(source.updatedAt),
        getMillis(source.localUpdatedAt),
        getMillis(source.archivedAt),
        getMillis(source.createdAt),
        getMillis(source.localCreatedAt),
        getMillis(source.orderDate),
        0
    );
}

export function getRevenueTrendTimestamp(record) {
    var source = record || {};
    return Math.max(
        getMillis(source.fulfilledAt),
        getMillis(source.paidAt),
        getMillis(source.orderDate),
        getMillis(source.createdAt),
        0
    );
}

export function normalizeArchivedFilter(value, includeArchived) {
    var filter = String(value || '').toLowerCase();
    if (filter === 'archived' || filter === 'all' || filter === 'active') {
        return filter;
    }
    return includeArchived === true ? 'all' : 'active';
}

export function filterRecordsByArchivedMode(records, archivedMode) {
    var mode = normalizeArchivedFilter(archivedMode, false);
    var list = Array.isArray(records) ? records : [];
    return list.filter(function(record) {
        var archived = isArchivedRecord(record);
        if (mode === 'archived') {
            return archived;
        }
        if (mode === 'all') {
            return true;
        }
        return !archived;
    });
}

export function countArchivedRecords(records) {
    var list = Array.isArray(records) ? records : [];
    var count = 0;
    for (var index = 0; index < list.length; index += 1) {
        if (isArchivedRecord(list[index])) {
            count += 1;
        }
    }
    return count;
}