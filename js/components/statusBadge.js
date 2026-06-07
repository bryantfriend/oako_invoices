import { ORDER_STATUS } from "../core/constants.js";
import { getDisplayStatus, normalizeStatusKey } from "../core/returnStatus.js";

const STATUS_CONFIG = {
    [ORDER_STATUS.DRAFT]: { color: 'var(--color-gray-600)', bg: 'var(--color-gray-100)' },
    submitted: { color: 'var(--color-warning)', bg: 'var(--color-warning-bg)' },
    [ORDER_STATUS.PENDING]: { color: 'var(--color-warning)', bg: 'var(--color-warning-bg)' },
    approved: { color: 'var(--color-info)', bg: 'var(--color-info-bg)' },
    [ORDER_STATUS.CONFIRMED]: { color: 'var(--color-info)', bg: 'var(--color-info-bg)' },
    [ORDER_STATUS.RETURNED]: { color: '#b45309', bg: '#fffbeb' },
    partially_returned: { color: '#92400e', bg: '#fef3c7' },
    partial_return: { color: '#92400e', bg: '#fef3c7' },
    fully_returned: { color: '#b45309', bg: '#fffbeb' },
    [ORDER_STATUS.FULFILLED]: { color: 'var(--color-success)', bg: 'var(--color-success-bg)' },
    fullfilled: { color: 'var(--color-success)', bg: 'var(--color-success-bg)' },
    [ORDER_STATUS.CANCELLED]: { color: 'var(--color-error)', bg: 'var(--color-error-bg)' },
    completed: { color: 'var(--color-success)', bg: 'var(--color-success-bg)' },
    return_pending: { color: 'var(--color-warning)', bg: 'var(--color-warning-bg)' },
    completed_pending_sync: { color: 'var(--color-info)', bg: 'var(--color-info-bg)' },
    sync_conflict: { color: 'var(--color-error)', bg: 'var(--color-error-bg)' },
};

export const createStatusBadge = (statusOrRecord) => {
    const statusKey = normalizeStatusKey(statusOrRecord);
    const config = STATUS_CONFIG[statusKey] || STATUS_CONFIG[ORDER_STATUS.DRAFT];
    const label = getDisplayStatus(statusOrRecord);

    return `
        <span class="status-badge" style="
            display: inline-flex;
            align-items: center;
            padding: 4px 10px;
            border-radius: 6px;
            background-color: ${config.bg};
            color: ${config.color};
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            line-height: 1;
        ">
            ${label}
        </span>
    `;
};
