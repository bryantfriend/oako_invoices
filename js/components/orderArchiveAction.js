export function createOrderArchiveAction(api) {
    var pending = new Set();

    return async function archiveDraftOrder(id) {
        if (pending.has(id)) return;
        pending.add(id);
        try {
            if (!api.confirm()) return;
            // Single and bulk archiving use the same six-stage ICF flow.
            var result = await api.archiveOrders([id], { source: 'archive-draft' });
            var processed = result ? (result.succeeded || []).concat(result.skipped || []) : [];
            if (!result || result.failed || !processed.length) {
                var failure = result && result.failures && result.failures[0];
                throw new Error(failure ? failure.message : 'Could not archive this order. Please try again.');
            }
            await api.applyArchive(id, processed[0].result);
        } catch (error) {
            api.showError(error && error.message ? error.message : 'Could not archive this order. Please try again.');
        } finally {
            pending.delete(id);
        }
    };
}
