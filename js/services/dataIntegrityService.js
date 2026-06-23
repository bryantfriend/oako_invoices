import { auth, db } from "../core/firebase.js";
import {
    collection,
    doc,
    runTransaction,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const AUDIT_COLLECTION = 'audit_logs';
const INVENTORY_COLLECTION = 'inventory';
const INVOICE_COLLECTION = 'invoices';
const PROCESSED_INTENT_COLLECTION = 'processed_invoice_intents';
const INVENTORY_VERSION = 1;

function safeNumber(value, fallback) {
    var number = Number(value);
    if (Number.isFinite(number)) {
        return number;
    }
    return fallback || 0;
}

function getActor(options) {
    var safeOptions = options || {};
    var explicitActor = safeOptions.actor || null;
    var user = auth.currentUser;

    if (explicitActor) {
        return {
            id: explicitActor.id || explicitActor.uid || 'anonymous',
            role: explicitActor.role || 'admin',
            email: explicitActor.email || ''
        };
    }

    if (!user) {
        return {
            id: 'anonymous',
            role: 'anonymous',
            email: ''
        };
    }

    return {
        id: user.uid || user.email || 'anonymous',
        role: 'admin',
        email: user.email || ''
    };
}

function getAuditUser(actor) {
    if (!actor) {
        return 'anonymous';
    }
    return actor.email || actor.id || 'anonymous';
}

function getInvoiceDate(invoice) {
    var source = invoice || {};
    var value = source.createdAt || source.dueDate || source.orderDate || new Date();
    var date = null;

    if (value && typeof value.toDate === 'function') {
        date = value.toDate();
    } else if (value instanceof Date) {
        date = value;
    } else if (value && value.seconds) {
        date = new Date(value.seconds * 1000);
    } else {
        date = new Date(value);
    }

    if (!date || Number.isNaN(date.getTime())) {
        date = new Date();
    }

    return date.toISOString().split('T')[0];
}

function getItemProductId(item) {
    var source = item || {};
    return source.productId || source.id || '';
}

function getItemLineKey(item, index) {
    var source = item || {};
    return source.lineItemId || getItemProductId(source) || 'line-' + String(index);
}

function getItemDisplayName(item) {
    var source = item || {};
    return source.displayName || source.name || source.name_en || source.name_ru || source.name_kg || source.productName || 'Product';
}

function getItemQuantity(item) {
    var source = item || {};
    if (source.adjustedQuantity !== undefined) {
        return safeNumber(source.adjustedQuantity, 0);
    }
    return safeNumber(source.quantity, 0);
}

function getItemReturnedQuantity(item) {
    var source = item || {};
    return safeNumber(source.returnedQuantity || source.returnQuantity, 0);
}

function getInvoiceItems(invoice) {
    if (!invoice) {
        return [];
    }
    if (!Array.isArray(invoice.items)) {
        return [];
    }
    return invoice.items;
}

function getReturnItemsFromRecords(invoice) {
    var items = [];
    var source = invoice || {};
    var returnRecords = Array.isArray(source.returns) ? source.returns : [];

    for (var recordIndex = 0; recordIndex < returnRecords.length; recordIndex += 1) {
        var record = returnRecords[recordIndex] || {};
        var recordItems = Array.isArray(record.items) ? record.items : [];
        for (var itemIndex = 0; itemIndex < recordItems.length; itemIndex += 1) {
            items.push(recordItems[itemIndex]);
        }
    }

    return items;
}

function addInventoryDelta(deltaMap, date, productId, invoiceQuantityDelta, returnedQuantityDelta) {
    if (!productId) {
        return;
    }

    var key = date + '_' + productId;
    if (!deltaMap[key]) {
        deltaMap[key] = {
            date: date,
            productId: productId,
            invoiceQuantityDelta: 0,
            returnedQuantityDelta: 0
        };
    }

    deltaMap[key].invoiceQuantityDelta += invoiceQuantityDelta;
    deltaMap[key].returnedQuantityDelta += returnedQuantityDelta;
}

function addInvoiceEffectToMap(deltaMap, invoice, multiplier) {
    var date = getInvoiceDate(invoice);
    var items = getInvoiceItems(invoice);

    for (var index = 0; index < items.length; index += 1) {
        var item = items[index] || {};
        var productId = getItemProductId(item);
        var quantity = getItemQuantity(item);
        var returnedQuantity = getItemReturnedQuantity(item);

        addInventoryDelta(
            deltaMap,
            date,
            productId,
            quantity * multiplier,
            returnedQuantity * multiplier
        );
    }
}

function buildInventoryDeltas(previousInvoice, nextInvoice, action) {
    var deltaMap = {};

    if (action === 'create') {
        addInvoiceEffectToMap(deltaMap, nextInvoice, 1);
    } else if (action === 'archive') {
        if (previousInvoice && previousInvoice.inventoryApplied === true && previousInvoice.inventoryDeleted !== true) {
            addInvoiceEffectToMap(deltaMap, previousInvoice, -1);
        }
    } else if (action === 'restore') {
        if (previousInvoice && previousInvoice.inventoryApplied === true && previousInvoice.inventoryDeleted === true) {
            addInvoiceEffectToMap(deltaMap, previousInvoice, 1);
        }
    } else if (previousInvoice && previousInvoice.inventoryApplied === true) {
        addInvoiceEffectToMap(deltaMap, previousInvoice, -1);
        addInvoiceEffectToMap(deltaMap, nextInvoice, 1);
    }

    return Object.keys(deltaMap)
        .map(function(key) {
            return deltaMap[key];
        })
        .filter(function(delta) {
            return delta.invoiceQuantityDelta !== 0 || delta.returnedQuantityDelta !== 0;
        });
}

function getInventoryDocId(delta) {
    return delta.date + '_' + delta.productId;
}

function buildInventoryRecord(existingData, delta, options) {
    var source = existingData || {};
    var totalBaked = safeNumber(source.totalBaked, 0);
    var invoiceQuantity = safeNumber(source.invoiceQuantity, 0) + safeNumber(delta.invoiceQuantityDelta, 0);
    var returnedQuantity = safeNumber(source.returnedQuantity, 0) + safeNumber(delta.returnedQuantityDelta, 0);

    return Object.assign({}, source, {
        date: delta.date,
        productId: delta.productId,
        totalBaked: totalBaked,
        locked: source.locked === true,
        invoiceQuantity: invoiceQuantity,
        returnedQuantity: returnedQuantity,
        availableQuantity: totalBaked - invoiceQuantity + returnedQuantity,
        inventoryVersion: INVENTORY_VERSION,
        lastInventoryAction: options && options.action ? options.action : '',
        lastInventoryAdjustedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    });
}

function buildBaseAuditEntry(type, entityType, entityId, options) {
    var safeOptions = options || {};
    var actor = getActor(safeOptions);

    return {
        type: type,
        entityType: entityType,
        entityId: entityId || '',
        user: getAuditUser(actor),
        actorId: actor.id || '',
        actorRole: actor.role || '',
        timestamp: serverTimestamp(),
        createdAt: serverTimestamp(),
        source: safeOptions.source || 'ui',
        storeId: safeOptions.storeId || '',
        companyId: safeOptions.companyId || ''
    };
}

function getScopeFromInvoice(invoice, options) {
    var source = invoice || {};
    var safeOptions = options || {};
    return {
        storeId: source.storeId || safeOptions.storeId || source.companyId || '',
        companyId: source.companyId || safeOptions.companyId || source.storeId || ''
    };
}

function addAuditEntry(entries, entry) {
    entries.push(entry);
}

function addStatusChangeAudit(entries, previousInvoice, nextInvoice, options) {
    var previousStatus = previousInvoice ? previousInvoice.status || '' : '';
    var nextStatus = nextInvoice ? nextInvoice.status || '' : '';

    if (!previousStatus || !nextStatus || previousStatus === nextStatus) {
        return;
    }

    var scope = getScopeFromInvoice(nextInvoice || previousInvoice, options);
    var entry = buildBaseAuditEntry('STATUS_CHANGED', 'invoice', getInvoiceId(nextInvoice || previousInvoice), Object.assign({}, options || {}, scope));
    entry.invoiceId = getInvoiceId(nextInvoice || previousInvoice);
    entry.previousStatus = previousStatus;
    entry.status = nextStatus;
    entry.details = {
        previousStatus: previousStatus,
        nextStatus: nextStatus
    };
    addAuditEntry(entries, entry);
}

function getInvoiceId(invoice) {
    var source = invoice || {};
    return source.id || source.invoiceId || '';
}

function buildItemLookup(invoice) {
    var lookup = {};
    var items = getInvoiceItems(invoice);

    for (var index = 0; index < items.length; index += 1) {
        var item = items[index] || {};
        var key = getItemLineKey(item, index);
        lookup[key] = {
            item: item,
            quantity: getItemQuantity(item)
        };
    }

    return lookup;
}

function addItemChangeAudits(entries, previousInvoice, nextInvoice, options) {
    var previousLookup = buildItemLookup(previousInvoice);
    var nextLookup = buildItemLookup(nextInvoice);
    var invoice = nextInvoice || previousInvoice || {};
    var invoiceId = getInvoiceId(invoice);
    var scope = getScopeFromInvoice(invoice, options);
    var seenKeys = {};
    var nextKeys = Object.keys(nextLookup);
    var previousKeys = Object.keys(previousLookup);

    for (var nextIndex = 0; nextIndex < nextKeys.length; nextIndex += 1) {
        var nextKey = nextKeys[nextIndex];
        var nextEntry = nextLookup[nextKey];
        var previousEntry = previousLookup[nextKey];
        seenKeys[nextKey] = true;

        if (!previousEntry) {
            addProductAudit(entries, 'PRODUCT_ADDED', invoiceId, nextEntry.item, 0, nextEntry.quantity, Object.assign({}, options || {}, scope));
        } else if (previousEntry.quantity !== nextEntry.quantity) {
            addProductAudit(entries, 'QUANTITY_CHANGED', invoiceId, nextEntry.item, previousEntry.quantity, nextEntry.quantity, Object.assign({}, options || {}, scope));
        }
    }

    for (var previousIndex = 0; previousIndex < previousKeys.length; previousIndex += 1) {
        var previousKey = previousKeys[previousIndex];
        if (seenKeys[previousKey]) {
            continue;
        }
        var removedEntry = previousLookup[previousKey];
        addProductAudit(entries, 'PRODUCT_REMOVED', invoiceId, removedEntry.item, removedEntry.quantity, 0, Object.assign({}, options || {}, scope));
    }
}

function addProductAudit(entries, type, invoiceId, item, previousQuantity, nextQuantity, options) {
    var source = item || {};
    var entry = buildBaseAuditEntry(type, 'invoice', invoiceId, options);
    entry.invoiceId = invoiceId;
    entry.productId = getItemProductId(source);
    entry.lineItemId = source.lineItemId || '';
    entry.productName = getItemDisplayName(source);
    entry.previousQuantity = previousQuantity;
    entry.quantity = nextQuantity;
    entry.deltaQuantity = nextQuantity - previousQuantity;
    entry.details = {
        productId: entry.productId,
        productName: entry.productName,
        previousQuantity: previousQuantity,
        nextQuantity: nextQuantity,
        deltaQuantity: entry.deltaQuantity
    };
    addAuditEntry(entries, entry);
}

function addReturnAudits(entries, invoice, returnItems, options) {
    var sourceInvoice = invoice || {};
    var invoiceId = getInvoiceId(sourceInvoice);
    var scope = getScopeFromInvoice(sourceInvoice, options);
    var items = Array.isArray(returnItems) ? returnItems : [];

    for (var index = 0; index < items.length; index += 1) {
        var item = items[index] || {};
        var quantity = safeNumber(item.returnedQuantity || item.quantity || item.returnQuantity, 0);
        if (quantity <= 0) {
            continue;
        }

        var entry = buildBaseAuditEntry('RETURN_RECORDED', 'return', invoiceId, Object.assign({}, options || {}, scope));
        entry.invoiceId = invoiceId;
        entry.returnId = options && options.returnId ? options.returnId : '';
        entry.productId = getItemProductId(item);
        entry.lineItemId = item.lineItemId || '';
        entry.productName = getItemDisplayName(item);
        entry.quantity = quantity;
        entry.details = {
            productId: entry.productId,
            productName: entry.productName,
            quantity: quantity,
            reason: options && options.reason ? options.reason : '',
            note: options && options.note ? options.note : ''
        };
        addAuditEntry(entries, entry);
    }
}

function buildInvoiceAuditEntries(previousInvoice, nextInvoice, action, options) {
    var entries = [];
    var invoice = nextInvoice || previousInvoice || {};
    var invoiceId = getInvoiceId(invoice);
    var scope = getScopeFromInvoice(invoice, options);

    if (action === 'create') {
        var createEntry = buildBaseAuditEntry('INVOICE_CREATED', 'invoice', invoiceId, Object.assign({}, options || {}, scope));
        createEntry.invoiceId = invoiceId;
        createEntry.details = {
            orderId: invoice.orderId || '',
            invoiceNumber: invoice.invoiceNumber || ''
        };
        addAuditEntry(entries, createEntry);
        addItemChangeAudits(entries, null, nextInvoice, options);
    } else if (action === 'archive') {
        var archiveEntry = buildBaseAuditEntry('INVOICE_ARCHIVED', 'invoice', invoiceId, Object.assign({}, options || {}, scope));
        archiveEntry.invoiceId = invoiceId;
        archiveEntry.previousStatus = previousInvoice ? previousInvoice.status || '' : '';
        archiveEntry.details = {
            previousStatus: archiveEntry.previousStatus
        };
        addAuditEntry(entries, archiveEntry);
        addStatusChangeAudit(entries, previousInvoice, nextInvoice, options);
    } else if (action === 'restore') {
        var restoreEntry = buildBaseAuditEntry('INVOICE_RESTORED', 'invoice', invoiceId, Object.assign({}, options || {}, scope));
        restoreEntry.invoiceId = invoiceId;
        restoreEntry.status = nextInvoice ? nextInvoice.status || '' : '';
        restoreEntry.details = {
            restoredStatus: restoreEntry.status
        };
        addAuditEntry(entries, restoreEntry);
        addStatusChangeAudit(entries, previousInvoice, nextInvoice, options);
    } else if (action === 'return') {
        addReturnAudits(entries, nextInvoice || previousInvoice, options && options.returnItems ? options.returnItems : getReturnItemsFromRecords(nextInvoice), options);
        addStatusChangeAudit(entries, previousInvoice, nextInvoice, options);
    } else {
        var startingEntryCount = entries.length;
        addItemChangeAudits(entries, previousInvoice, nextInvoice, options);
        addStatusChangeAudit(entries, previousInvoice, nextInvoice, options);
        if (entries.length === startingEntryCount) {
            var updateEntry = buildBaseAuditEntry('INVOICE_UPDATED', 'invoice', invoiceId, Object.assign({}, options || {}, scope));
            updateEntry.invoiceId = invoiceId;
            updateEntry.details = {
                action: action || 'update'
            };
            addAuditEntry(entries, updateEntry);
        }
    }

    return entries;
}

function prepareInvoicePayloadForCreate(payload) {
    return Object.assign({}, payload || {}, {
        inventoryApplied: true,
        inventoryDeleted: false,
        inventoryVersion: INVENTORY_VERSION,
        inventoryAppliedAt: serverTimestamp()
    });
}

function prepareInvoiceUpdatePayload(updatePayload, previousInvoice, action) {
    var payload = Object.assign({}, updatePayload || {});

    if (action === 'archive' && previousInvoice && previousInvoice.inventoryApplied === true && previousInvoice.inventoryDeleted !== true) {
        payload.inventoryDeleted = true;
        payload.inventoryRestoredAt = serverTimestamp();
    }

    if (action === 'restore' && previousInvoice && previousInvoice.inventoryApplied === true && previousInvoice.inventoryDeleted === true) {
        payload.inventoryDeleted = false;
        payload.inventoryReappliedAt = serverTimestamp();
    }

    if (previousInvoice && previousInvoice.inventoryApplied === true && action !== 'archive' && action !== 'restore') {
        payload.inventoryApplied = true;
        payload.inventoryVersion = INVENTORY_VERSION;
        payload.inventoryAdjustedAt = serverTimestamp();
    }

    return payload;
}

async function applyInventoryDeltasInTransaction(transaction, deltas, options) {
    var snapshots = [];

    for (var index = 0; index < deltas.length; index += 1) {
        var delta = deltas[index];
        var inventoryRef = doc(db, INVENTORY_COLLECTION, getInventoryDocId(delta));
        var snapshot = await transaction.get(inventoryRef);
        snapshots.push({
            ref: inventoryRef,
            snapshot: snapshot,
            delta: delta
        });
    }

    for (var writeIndex = 0; writeIndex < snapshots.length; writeIndex += 1) {
        var item = snapshots[writeIndex];
        var existingData = item.snapshot.exists() ? item.snapshot.data() : {};
        var record = buildInventoryRecord(existingData, item.delta, options);
        transaction.set(item.ref, record, { merge: true });
    }
}

function addAuditEntriesInTransaction(transaction, entries) {
    for (var index = 0; index < entries.length; index += 1) {
        var auditRef = doc(collection(db, AUDIT_COLLECTION));
        transaction.set(auditRef, entries[index]);
    }
}

function getProcessedIntentRef(options) {
    var safeOptions = options || {};
    if (!safeOptions.intentId) {
        return null;
    }
    return doc(db, PROCESSED_INTENT_COLLECTION, safeOptions.intentId);
}

async function getProcessedIntentSnapshot(transaction, options) {
    var intentRef = getProcessedIntentRef(options);
    if (!intentRef) {
        return null;
    }
    return transaction.get(intentRef);
}

function writeProcessedIntentInTransaction(transaction, options, result) {
    var intentRef = getProcessedIntentRef(options);
    if (!intentRef) {
        return;
    }

    var safeOptions = options || {};
    var actor = getActor(safeOptions);
    transaction.set(intentRef, {
        intentId: safeOptions.intentId,
        intentType: safeOptions.intentType || '',
        aggregateType: 'invoice',
        aggregateId: result && result.invoiceId ? result.invoiceId : '',
        actorId: actor.id || '',
        actorRole: actor.role || '',
        result: result || {},
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        retentionPolicy: 'retain_for_financial_idempotency'
    });
}

async function createInvoiceWithIntegrity(invoicePayload, options) {
    var safeOptions = options || {};
    var invoiceRef = safeOptions.invoiceRef || doc(collection(db, INVOICE_COLLECTION));
    var payload = prepareInvoicePayloadForCreate(invoicePayload);
    var invoiceWithId = Object.assign({ id: invoiceRef.id }, payload);
    var deltas = buildInventoryDeltas(null, invoiceWithId, 'create');
    var auditEntries = buildInvoiceAuditEntries(null, invoiceWithId, 'create', safeOptions);

    var transactionResult = await runTransaction(db, async function(transaction) {
        var processedSnapshot = await getProcessedIntentSnapshot(transaction, safeOptions);
        if (processedSnapshot && processedSnapshot.exists()) {
            return processedSnapshot.data().result || { invoiceId: invoiceRef.id, alreadyProcessed: true };
        }

        await applyInventoryDeltasInTransaction(transaction, deltas, {
            action: 'invoice_create'
        });
        transaction.set(invoiceRef, payload);
        addAuditEntriesInTransaction(transaction, auditEntries);
        writeProcessedIntentInTransaction(transaction, safeOptions, {
            invoiceId: invoiceRef.id,
            alreadyProcessed: false
        });

        return {
            invoiceId: invoiceRef.id,
            alreadyProcessed: false
        };
    });

    return transactionResult && transactionResult.invoiceId ? transactionResult.invoiceId : invoiceRef.id;
}

async function setInvoiceWithIntegrity(invoiceRef, invoicePayload, options) {
    var safeOptions = options || {};
    var payload = prepareInvoicePayloadForCreate(invoicePayload);
    var invoiceWithId = Object.assign({ id: invoiceRef.id }, payload);
    var deltas = buildInventoryDeltas(null, invoiceWithId, 'create');
    var auditEntries = buildInvoiceAuditEntries(null, invoiceWithId, 'create', safeOptions);

    var transactionResult = await runTransaction(db, async function(transaction) {
        var processedSnapshot = await getProcessedIntentSnapshot(transaction, safeOptions);
        if (processedSnapshot && processedSnapshot.exists()) {
            return processedSnapshot.data().result || { invoiceId: invoiceRef.id, alreadyProcessed: true };
        }

        await applyInventoryDeltasInTransaction(transaction, deltas, {
            action: 'invoice_create'
        });
        transaction.set(invoiceRef, payload, { merge: true });
        addAuditEntriesInTransaction(transaction, auditEntries);
        writeProcessedIntentInTransaction(transaction, safeOptions, {
            invoiceId: invoiceRef.id,
            alreadyProcessed: false
        });

        return {
            invoiceId: invoiceRef.id,
            alreadyProcessed: false
        };
    });

    return transactionResult && transactionResult.invoiceId ? transactionResult.invoiceId : invoiceRef.id;
}

async function updateInvoiceWithIntegrity(invoiceRef, previousInvoice, updatePayload, options) {
    var safeOptions = options || {};
    var action = safeOptions.action || 'update';
    var payload = prepareInvoiceUpdatePayload(updatePayload, previousInvoice, action);
    var nextInvoice = Object.assign({}, previousInvoice || {}, payload, {
        id: invoiceRef.id
    });
    var deltas = buildInventoryDeltas(previousInvoice, nextInvoice, action);
    var auditEntries = buildInvoiceAuditEntries(previousInvoice, nextInvoice, action, safeOptions);

    var transactionResult = await runTransaction(db, async function(transaction) {
        var processedSnapshot = await getProcessedIntentSnapshot(transaction, safeOptions);
        if (processedSnapshot && processedSnapshot.exists()) {
            return processedSnapshot.data().result || { updated: true, alreadyProcessed: true };
        }

        await applyInventoryDeltasInTransaction(transaction, deltas, {
            action: 'invoice_' + action
        });
        transaction.update(invoiceRef, payload);
        addAuditEntriesInTransaction(transaction, auditEntries);
        writeProcessedIntentInTransaction(transaction, safeOptions, {
            invoiceId: invoiceRef.id,
            updated: true,
            alreadyProcessed: false
        });

        return {
            invoiceId: invoiceRef.id,
            updated: true,
            alreadyProcessed: false
        };
    });

    return transactionResult || { updated: true };
}

async function recordAuditLog(entry, options) {
    var safeEntry = Object.assign(
        buildBaseAuditEntry(entry.type || 'AUDIT_EVENT', entry.entityType || 'system', entry.entityId || '', options),
        entry || {}
    );
    var auditRef = doc(collection(db, AUDIT_COLLECTION));

    await runTransaction(db, async function(transaction) {
        transaction.set(auditRef, safeEntry);
    });

    return auditRef.id;
}

async function recordAuditLogSafely(entry, options) {
    try {
        return await recordAuditLog(entry, options);
    } catch (error) {
        console.warn('Audit log write skipped.', error);
        return '';
    }
}

export const dataIntegrityService = {
    createInvoiceWithIntegrity: createInvoiceWithIntegrity,
    setInvoiceWithIntegrity: setInvoiceWithIntegrity,
    updateInvoiceWithIntegrity: updateInvoiceWithIntegrity,
    recordAuditLog: recordAuditLog,
    recordAuditLogSafely: recordAuditLogSafely,
    buildInvoiceAuditEntries: buildInvoiceAuditEntries,
    buildInventoryDeltas: buildInventoryDeltas
};
