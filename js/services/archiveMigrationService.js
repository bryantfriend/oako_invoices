import { auth, db } from "../core/firebase.js";
import {
    collection,
    deleteField,
    doc,
    getDocs,
    serverTimestamp,
    writeBatch
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const BATCH_SIZE = 350;

function buildMigrationPatch(record, fallbackStatus) {
    const source = record || {};
    const legacyStatus = String(source.status || '').trim().toLowerCase() === 'archived';
    const patch = {};

    if (legacyStatus) {
        patch.status = String(source.previousStatus || fallbackStatus).trim().toLowerCase();
        patch.archived = source.archived !== false;
    } else if (typeof source.archived !== 'boolean') {
        patch.archived = false;
    }

    if (source.previousStatus !== undefined) {
        patch.previousStatus = deleteField();
    }

    return patch;
}

async function commitOperations(operations, onProgress) {
    let committed = 0;
    for (let start = 0; start < operations.length; start += BATCH_SIZE) {
        const chunk = operations.slice(start, start + BATCH_SIZE);
        const batch = writeBatch(db);
        chunk.forEach(function(operation) {
            const payload = Object.assign({}, operation.patch, {
                archiveSchemaVersion: 1,
                archiveMigratedAt: serverTimestamp()
            });
            if (operation.merge === true) batch.set(operation.ref, payload, { merge: true });
            else batch.update(operation.ref, payload);
        });
        await batch.commit();
        committed += chunk.length;
        if (typeof onProgress === 'function') {
            onProgress({ completed: committed, total: operations.length, percent: Math.round((committed / operations.length) * 100) });
        }
    }
    return committed;
}

export const archiveMigrationService = {
    async migrate(options) {
        const safeOptions = options || {};
        const dryRun = safeOptions.dryRun !== false;
        if (!auth.currentUser) throw new Error('Sign in as an administrator to migrate archive data.');

        const groups = await Promise.all([
            getDocs(collection(db, 'orders')),
            getDocs(collection(db, 'invoices')),
            getDocs(collection(db, 'orders_archive')).catch(function() { return { docs: [] }; })
        ]);
        const existingOrderIds = new Set(groups[0].docs.map(snapshot => snapshot.id));
        const operations = [];
        const report = {
            dryRun: dryRun,
            scannedOrders: groups[0].size || groups[0].docs.length,
            scannedInvoices: groups[1].size || groups[1].docs.length,
            scannedLegacyOrders: groups[2].size || groups[2].docs.length,
            orderUpdates: 0,
            invoiceUpdates: 0,
            legacyOrdersCopied: 0,
            totalChanges: 0,
            committed: 0
        };

        groups[0].docs.forEach(function(snapshot) {
            const patch = buildMigrationPatch(snapshot.data(), 'draft');
            if (Object.keys(patch).length) {
                operations.push({ ref: snapshot.ref, patch: patch });
                report.orderUpdates += 1;
            }
        });
        groups[1].docs.forEach(function(snapshot) {
            const patch = buildMigrationPatch(snapshot.data(), 'open');
            if (Object.keys(patch).length) {
                operations.push({ ref: snapshot.ref, patch: patch });
                report.invoiceUpdates += 1;
            }
        });
        groups[2].docs.forEach(function(snapshot) {
            if (existingOrderIds.has(snapshot.id)) return;
            const source = snapshot.data() || {};
            const status = String(source.previousStatus || (String(source.status || '').toLowerCase() === 'archived' ? 'draft' : source.status || 'draft')).toLowerCase();
            const copiedOrder = Object.assign({}, source, { archived: true, status: status });
            delete copiedOrder.id;
            delete copiedOrder.previousStatus;
            operations.push({
                ref: doc(db, 'orders', snapshot.id),
                merge: true,
                patch: copiedOrder
            });
            report.legacyOrdersCopied += 1;
        });

        report.totalChanges = operations.length;
        if (!dryRun && operations.length) {
            report.committed = await commitOperations(operations, safeOptions.onProgress);
        }
        return report;
    }
};
