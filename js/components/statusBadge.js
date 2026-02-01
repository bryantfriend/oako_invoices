import { ORDER_STATUS } from "../core/constants.js";

const STATUS_CONFIG = {
    [ORDER_STATUS.DRAFT]: { color: 'var(--color-gray-600)', bg: 'var(--color-gray-100)' },
    [ORDER_STATUS.PENDING]: { color: 'var(--color-warning)', bg: 'var(--color-warning-bg)' },
    [ORDER_STATUS.CONFIRMED]: { color: 'var(--color-info)', bg: 'var(--color-info-bg)' },
    [ORDER_STATUS.FULFILLED]: { color: 'var(--color-success)', bg: 'var(--color-success-bg)' },
    [ORDER_STATUS.CANCELLED]: { color: 'var(--color-error)', bg: 'var(--color-error-bg)' },
};

export const createStatusBadge = (status) => {
    const config = STATUS_CONFIG[status] || STATUS_CONFIG[ORDER_STATUS.DRAFT];

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
            ${status}
        </span>
    `;
};
