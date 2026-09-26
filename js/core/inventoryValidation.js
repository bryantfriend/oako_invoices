export function validateInventoryEntry(date, productId, data) {
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) {
        throw new Error('A valid inventory date is required.');
    }
    if (typeof productId !== 'string' || !productId.trim() || productId !== productId.trim() || /[/]/.test(productId)) {
        throw new Error('A valid product ID is required.');
    }
    if (!data || (data.totalBaked === undefined && data.locked === undefined)) {
        throw new Error('A production quantity or lock status is required.');
    }
    if (data.totalBaked !== undefined) parseProductionQuantity(data.totalBaked);
    if (data.locked !== undefined && typeof data.locked !== 'boolean') throw new Error('Lock status must be true or false.');
}

export function parseProductionQuantity(value) {
    if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') {
        throw new Error('Enter a baked quantity. Blank entries are not saved.');
    }
    var quantity = Number(value);
    if (!Number.isFinite(quantity) || quantity < 0 || quantity > Number.MAX_SAFE_INTEGER) {
        throw new Error('Baked quantity must be a finite, nonnegative number.');
    }
    // Existing inventory and order quantities support fractions; do not truncate them.
    return quantity;
}
