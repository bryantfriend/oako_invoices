const LEGACY_ARCHIVED_STATUS = 'archived';

export function hasLegacyArchivedStatus(record) {
    return String(record && record.status || '').trim().toLowerCase() === LEGACY_ARCHIVED_STATUS;
}

export function normalizeArchivedRecord(record, fallbackStatus) {
    if (!record) {
        return record;
    }

    const legacyStatus = hasLegacyArchivedStatus(record);
    const hasArchiveFlag = typeof record.archived === 'boolean';
    const archived = hasArchiveFlag ? record.archived : legacyStatus;
    const restoredStatus = legacyStatus
        ? String(record.previousStatus || fallbackStatus || 'draft').trim().toLowerCase()
        : String(record.status || fallbackStatus || 'draft').trim().toLowerCase();

    if (record.archived === archived && record.status === restoredStatus) {
        return record;
    }

    return Object.assign({}, record, {
        archived: archived,
        status: restoredStatus
    });
}

export function isArchivedRecord(record) {
    return !!(record && record.archived === true);
}
