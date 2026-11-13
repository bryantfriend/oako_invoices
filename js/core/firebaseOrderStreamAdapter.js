import { normalizeArchivedRecord } from './archiveRecordHelpers.js';

export function normalizeStreamOrder(id, data, archived) {
    var row = Object.assign({}, data, { id: id });
    if (archived) {
        var status = String(row.status || '').toLowerCase();
        row.archived = true;
        row.status = row.previousStatus || (status !== 'archived' ? status : 'draft');
    }
    return normalizeArchivedRecord(row, 'draft');
}

// Query contract intentionally matches the legacy unfiltered order history and
// latest250 invoice context. Do not add limits/date predicates to order streams.
export function createFirebaseOrderStreamAdapter(sdk, db) {
    function reference(name) {
        if (name === 'invoices') return sdk.query(sdk.collection(db, 'invoices'), sdk.orderBy('updatedAt', 'desc'), sdk.limit(250));
        return sdk.collection(db, name === 'archive' ? 'orders_archive' : 'orders');
    }
    return {
        subscribe: function subscribe(name, options, next, error) {
            return sdk.onSnapshot(reference(name), { includeMetadataChanges: true }, function received(snapshot) {
                next({ fromCache: snapshot.metadata.fromCache, hasPendingWrites: snapshot.metadata.hasPendingWrites,
                    docs: snapshot.docs.map(function row(doc) {
                        if (name === 'invoices') return Object.assign({}, doc.data(), { id: doc.id });
                        return normalizeStreamOrder(doc.id, doc.data(), name === 'archive');
                    }) });
            }, error);
        },
        reconcileMissing: async function reconcileMissing(id) {
            var current = await sdk.getDocFromServer(sdk.doc(db, 'orders', id));
            if (current.exists()) return normalizeStreamOrder(id, current.data(), false);
            var archived = await sdk.getDocFromServer(sdk.doc(db, 'orders_archive', id));
            return archived.exists() ? normalizeStreamOrder(id, archived.data(), true) : null;
        }
    };
}

export function selectReturnInvoices(rows) {
    return rows.map(function normalize(row) { return normalizeArchivedRecord(row, 'open'); }).filter(function returned(invoice) {
        if (Array.isArray(invoice.returns) && invoice.returns.length > 0) return true;
        if (Array.isArray(invoice.courierReturns) && invoice.courierReturns.length > 0) return true;
        if (Array.isArray(invoice.returnItems) && invoice.returnItems.some(function positive(item) { return Number(item && item.quantity) > 0; })) return true;
        if (invoice.returnRequested || invoice.returnedBy || invoice.returnedAt) return true;
        return Number(invoice.returnSummary && invoice.returnSummary.totalReturnedQuantity || 0) > 0;
    });
}
