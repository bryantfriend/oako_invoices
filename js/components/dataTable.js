export class DataTable {
    constructor({ columns, data, onRowClick, actions, onSort, sortKey, sortOrder }) {
        this.columns = columns; // [{ key, label, render, sortable }]
        this.data = data || [];
        this.onRowClick = onRowClick;
        this.actions = actions; // function(row) -> html
        this.onSort = onSort; // function(key)
        this.sortKey = sortKey;
        this.sortOrder = sortOrder; // 'asc' | 'desc'
    }

    render() {
        return `
            <div style="overflow-x: auto; border-radius: var(--radius-lg); border: 1px solid var(--color-gray-200);">
                <table style="width: 100%; border-collapse: collapse; background: white; font-size: var(--text-sm);">
                    <thead style="background: var(--color-gray-50); border-bottom: 1px solid var(--color-gray-200);">
                        <tr>
                            ${this.columns.map(col => {
            const isSortable = col.sortable !== false;
            const isActive = this.sortKey === col.key;
            const indicator = isActive ? (this.sortOrder === 'asc' ? ' ↑' : ' ↓') : '';
            return `
                                    <th 
                                        class="${isSortable ? 'sortable-header' : ''}"
                                        data-key="${col.key}"
                                        style="
                                            text-align: ${col.align || 'left'}; 
                                            padding: 12px 16px; 
                                            font-weight: 600; 
                                            color: ${isActive ? 'var(--color-primary-700)' : 'var(--color-gray-600)'};
                                            cursor: ${isSortable ? 'pointer' : 'default'};
                                            user-select: none;
                                            white-space: nowrap;
                                            transition: background 0.2s;
                                        "
                                        ${isSortable ? `onclick="window.handleTableSort('${col.key}')"` : ''}
                                    >
                                        ${col.label}${indicator}
                                    </th>
                                `;
        }).join('')}
                            ${this.actions ? '<th style="padding: 12px 16px;"></th>' : ''}
                        </tr>
                    </thead>
                    <tbody>
                        ${this.data.length === 0 ? this.renderEmptyState() : this.renderRows()}
                    </tbody>
                </table>
            </div>
        `;
    }

    renderRows() {
        return this.data.map(row => `
            <tr 
                class="data-row" 
                data-id="${row.id}"
                style="
                    border-bottom: 1px solid var(--color-gray-100); 
                    transition: background var(--transition-fast); 
                    cursor: ${this.onRowClick ? 'pointer' : 'default'};
                "
                onmouseover="this.style.backgroundColor='var(--color-primary-50)'"
                onmouseout="this.style.backgroundColor='transparent'"
            >
                ${this.columns.map(col => `
                    <td style="padding: 12px 16px; color: var(--color-gray-700); text-align: ${col.align || 'left'};">
                        ${col.render ? col.render(row[col.key], row) : (row[col.key] || '-')}
                    </td>
                `).join('')}
                ${this.actions ? `
                    <td style="padding: 12px 16px; text-align: right;">
                        ${this.actions(row)}
                    </td>
                ` : ''}
            </tr>
        `).join('');
    }

    renderEmptyState() {
        return `
            <tr>
                <td colspan="${this.columns.length + (this.actions ? 1 : 0)}" style="padding: 48px; text-align: center; color: var(--color-gray-500);">
                    No data available
                </td>
            </tr>
        `;
    }

    // Since this returns a string, events need to be attached by the caller or a wrapper
    // For now we assume the caller will handle delegating events or using the rendered string.
    // Ideally, for a View component, we might want to return an element, but string is okay for simple injection.
}
