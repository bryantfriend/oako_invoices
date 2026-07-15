import { auth, db } from "../core/firebase.js";
import {
    collection,
    getDoc,
    getDocFromCache,
    doc,
    query,
    where,
    orderBy,
    limit,
    serverTimestamp,
    updateDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { orderService } from "./orderService.js";
import { settingsService } from "./settingsService.js";
import { gamificationService } from "./gamificationService.js";
import { qrService } from "./qrService.js";
import { customerService } from "./customerService.js";
import { offlineStatusService } from "./offlineStatusService.js";
import { offlineQueueService } from "./offlineQueueService.js";
import { deviceIdService } from "./deviceIdService.js";
import { conflictService } from "./conflictService.js";
import { dataIntegrityService } from "./dataIntegrityService.js";
import { logCollectionError } from "../core/firestoreDiagnostics.js";
import { getDocsWithCache } from "../core/firestoreRead.js";
import { calculateOrderTotals, getOrderItemUnitPrice, normalizeOrderItemPricing } from "../core/pricing.js";
import {
    canEditInvoiceDate,
    canEditInvoiceItems,
    getInvoiceWorkflowLockMessage,
    isInvoiceReadOnly
} from "../core/invoiceWorkflow.js";
import icfPipeline from "../ICF/engine/pipeline.js";
import archiveInvoiceIntentModule from "../ICF/Intents/ArchiveInvoiceIntent.js";
import updateInvoiceItemsIntentModule from "../ICF/Intents/UpdateInvoiceItemsIntent.js";
import recordInvoiceReturnIntentModule from "../ICF/Intents/RecordInvoiceReturnIntent.js";
import {
    buildInvoiceItemFromProduct,
    getItemReturnedQuantity,
    normalizeInvoiceItemsForEditing,
    recalculateInvoiceTotals,
    validateEditableItems
} from "../ICF/Stages/Processors/Invoices/invoiceEditHelpers.js";

const COLLECTION = 'invoices';
const WORKING_INVOICE_LIMIT = 120;
const RECENT_HISTORY_LIMIT = 60;
const ARCHIVED_INVOICE_LIMIT = 200;
const RETURN_ANALYTICS_LIMIT = 250;

function getActorId(user) {
    if (!user) {
        return '';
    }
    return user.email || user.uid || '';
}

function getCurrentAdminActor() {
    const user = auth.currentUser;
    if (!user) {
        return {
            id: 'anonymous',
            role: 'anonymous'
        };
    }

    return {
        id: getActorId(user) || 'anonymous',
        role: 'admin'
    };
}

function isActiveInvoice(invoice) {
    return invoice && invoice.status !== 'archived';
}

function isArchivedInvoice(invoice) {
    return invoice && invoice.status === 'archived';
}

function getMillis(value) {
    if (!value) {
        return 0;
    }
    if (typeof value.toMillis === 'function') {
        return value.toMillis();
    }
    if (typeof value.toDate === 'function') {
        return value.toDate().getTime();
    }
    if (value.seconds) {
        return value.seconds * 1000;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return 0;
    }
    return date.getTime();
}

function getStoreId(settings) {
    const source = settings || {};
    return source.storeId || source.companyId || 'KORG';
}

function isInvoiceItemsEditable(invoice) {
    return canEditInvoiceItems(invoice);
}

function getReturnQuantityFromRecordItem(item = {}) {
    if (item.returnedQuantity !== undefined) {
        return Number(item.returnedQuantity) || 0;
    }
    if (item.returnQuantity !== undefined) {
        return Number(item.returnQuantity) || 0;
    }
    return Number(item.quantity) || 0;
}

function isMatchingReturnItem(returnItem = {}, invoiceItem = {}) {
    const returnLineItemId = returnItem.lineItemId || '';
    const itemLineItemId = invoiceItem.lineItemId || '';
    const returnProductId = returnItem.productId || returnItem.id || '';
    const itemProductId = invoiceItem.productId || invoiceItem.id || '';

    return (returnLineItemId && itemLineItemId && returnLineItemId === itemLineItemId)
        || (returnProductId && itemProductId && returnProductId === itemProductId);
}

function sumMatchingReturnItems(returnItems = [], invoiceItem = {}) {
    return (Array.isArray(returnItems) ? returnItems : []).reduce((sum, returnItem) => {
        if (!isMatchingReturnItem(returnItem, invoiceItem)) {
            return sum;
        }
        return sum + getReturnQuantityFromRecordItem(returnItem);
    }, 0);
}

function getRecordedReturnQuantity(invoice = {}, invoiceItem = {}) {
    const returnItemsTotal = sumMatchingReturnItems(invoice.returnItems || [], invoiceItem);
    const returnRecordTotal = (Array.isArray(invoice.returns) ? invoice.returns : []).reduce((sum, returnRecord) => {
        return sum + sumMatchingReturnItems(returnRecord.items || returnRecord.returnItems || [], invoiceItem);
    }, 0);
    const courierReturnTotal = (Array.isArray(invoice.courierReturns) ? invoice.courierReturns : []).reduce((sum, returnRecord) => {
        return sum + sumMatchingReturnItems(returnRecord.items || returnRecord.returnItems || [], invoiceItem);
    }, 0);

    return Math.max(returnItemsTotal, returnRecordTotal, courierReturnTotal);
}

function getAnyReturnedQuantity(invoice = {}, invoiceItem = {}) {
    return Math.max(
        getItemReturnedQuantity(invoiceItem),
        getRecordedReturnQuantity(invoice, invoiceItem)
    );
}

function mergeById(target, invoices) {
    for (let index = 0; index < invoices.length; index += 1) {
        const invoice = invoices[index];
        if (invoice && invoice.id) {
            target[invoice.id] = Object.assign({}, target[invoice.id] || {}, invoice);
        }
    }
}

function sortInvoicesByNewest(a, b) {
    return getMillis(b.updatedAt || b.createdAt || b.localUpdatedAt) - getMillis(a.updatedAt || a.createdAt || a.localUpdatedAt);
}

async function applyLocalInvoiceOverlays(invoices) {
    const byId = {};
    mergeById(byId, invoices);

    const localSnapshots = await offlineQueueService.getLocalInvoiceSnapshots();
    const localIds = Object.keys(localSnapshots);
    for (let index = 0; index < localIds.length; index += 1) {
        const id = localIds[index];
        byId[id] = Object.assign({}, byId[id] || {}, localSnapshots[id]);
    }

    const conflicts = await conflictService.getOpenConflicts();
    for (let conflictIndex = 0; conflictIndex < conflicts.length; conflictIndex += 1) {
        const conflict = conflicts[conflictIndex];
        if (conflict.entityType === 'invoice') {
            byId[conflict.entityId] = Object.assign({}, byId[conflict.entityId] || conflict.localVersion || {}, {
                id: conflict.entityId,
                syncState: 'sync_conflict',
                status: 'sync_conflict'
            });
        }
    }

    return Object.keys(byId).map(function(id) {
        return byId[id];
    }).sort(sortInvoicesByNewest);
}

async function validateRestoreArchivedInvoiceIntent(intent) {
    if (!intent || typeof intent.invoiceId !== 'string' || !intent.invoiceId.trim()) {
        throw new Error('Invoice ID is required.');
    }
    return intent;
}

async function normalizeRestoreArchivedInvoiceIntent(intent) {
    return Object.assign({}, intent, {
        invoiceId: intent.invoiceId.trim()
    });
}

async function addRestoreArchivedInvoiceContext(intent) {
    const user = auth.currentUser;
    const invoice = await invoiceService.getInvoice(intent.invoiceId);
    const settings = await settingsService.getInvoiceSettings().catch(function() {
        return {};
    });

    return Object.assign({}, intent, {
        invoice: invoice,
        currentUser: user,
        actor: {
            id: getActorId(user),
            role: user ? 'admin' : 'anonymous'
        },
        settings: settings
    });
}

async function authorizeRestoreArchivedInvoiceIntent(context) {
    const user = context.currentUser;
    if (!user) {
        throw new Error('Only admins can restore archived invoices.');
    }

    const invoice = context.invoice;
    const settings = context.settings || {};
    const scopeId = settings.storeId || settings.companyId || '';
    const invoiceScopeId = invoice ? (invoice.storeId || invoice.companyId || '') : '';
    if (scopeId && invoiceScopeId && scopeId !== invoiceScopeId) {
        throw new Error('You do not have access to restore this invoice.');
    }

    return context;
}

async function processRestoreArchivedInvoiceIntent(context) {
    const invoice = context.invoice;
    if (!invoice) {
        throw new Error('Invoice not found.');
    }
    if (invoice.status !== 'archived') {
        throw new Error('Only archived invoices can be restored.');
    }

    const restoreStatus = invoice.previousStatus || 'open';
    await dataIntegrityService.updateInvoiceWithIntegrity(doc(db, COLLECTION, context.invoiceId), invoice, {
        status: restoreStatus,
        restoredAt: serverTimestamp(),
        restoredBy: getActorId(context.currentUser),
        updatedAt: serverTimestamp(),
        updatedBy: context.currentUser ? context.currentUser.uid : '',
        localUpdatedAt: new Date().toISOString(),
        syncState: 'synced'
    }, {
        action: 'restore',
        actor: context.actor,
        source: 'ui'
    });

    return Object.assign({}, context, {
        restoredStatus: restoreStatus
    });
}

async function emitRestoreArchivedInvoiceIntent(context) {
    return {
        ok: true,
        message: 'Invoice restored successfully.',
        data: {
            invoiceId: context.invoiceId,
            status: context.restoredStatus || 'open'
        }
    };
}

async function runInvoiceIntentPipeline(intentDefinition, intent) {
    const stageOrder = ['Validate', 'Normalize', 'AddContext', 'Authorize', 'Process', 'Emit'];
    let currentIntent = Object.assign({
        type: intentDefinition.type,
        payload: {},
        context: {},
        meta: {
            createdAt: Date.now(),
            source: 'ui'
        }
    }, intent || {});

    for (let index = 0; index < stageOrder.length; index += 1) {
        const stageName = stageOrder[index];
        const stageFunction = intentDefinition.stages[stageName];
        if (typeof stageFunction !== 'function') {
            return {
                ok: false,
                stage: stageName,
                reason: 'Intent stage is not registered.'
            };
        }

        try {
            currentIntent = await stageFunction(currentIntent);
        } catch (error) {
            return {
                ok: false,
                stage: stageName,
                reason: error.message || 'Intent stage failed.'
            };
        }
    }

    return currentIntent;
}

export const RestoreArchivedInvoiceIntent = {
    type: 'RestoreArchivedInvoiceIntent',
    stages: {
        Validate: validateRestoreArchivedInvoiceIntent,
        Normalize: normalizeRestoreArchivedInvoiceIntent,
        AddContext: addRestoreArchivedInvoiceContext,
        Authorize: authorizeRestoreArchivedInvoiceIntent,
        Process: processRestoreArchivedInvoiceIntent,
        Emit: emitRestoreArchivedInvoiceIntent
    },

    async run(intent) {
        return runInvoiceIntentPipeline(this, intent);
    }
};

function buildInvoicePayload(order, settings, customer, orderId, adjustments, invoiceNumber, secureToken, metadata) {
    const invoiceItems = (order.items || []).map(function(item) {
        return normalizeOrderItemPricing(item);
    });
    const orderTotals = calculateOrderTotals(invoiceItems);
    const subtotal = orderTotals.subtotal;
    const taxRate = adjustments.taxRate !== undefined ? adjustments.taxRate : settings.defaultTaxRate;
    const taxAmount = (subtotal * taxRate) / 100;
    let discountAmount = 0;

    if (adjustments.discountValue) {
        if (adjustments.discountType === 'percent') {
            discountAmount = (subtotal * adjustments.discountValue) / 100;
        } else {
            discountAmount = adjustments.discountValue;
        }
    }

    const totalAmount = subtotal + taxAmount - discountAmount;
    const date = new Date();
    const defaultInvoiceDateOffsetDays = parseInt(settings.defaultInvoiceDateOffsetDays, 10) || 0;
    date.setDate(date.getDate() + defaultInvoiceDateOffsetDays);
    const invoiceDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0);

    return {
        id: metadata.id || '',
        orderId: orderId,
        invoiceNumber: invoiceNumber,
        customerName: order.customerName,
        customerAddress: order.customerAddress || '',
        customerPinCode: customer && customer.pinCode ? customer.pinCode : '',
        items: invoiceItems,
        subtotal: subtotal,
        taxRate: taxRate,
        taxAmount: taxAmount,
        discountType: adjustments.discountType || 'none',
        discountValue: adjustments.discountValue || 0,
        discountAmount: discountAmount,
        totalAmount: totalAmount,
        status: 'draft',
        secureToken: secureToken,
        returnRequested: false,
        returnItems: [],
        settings: settings,
        storeId: metadata.storeId,
        companyId: metadata.companyId,
        createdAt: invoiceDate,
        dueDate: invoiceDate,
        updatedAt: metadata.updatedAt,
        updatedBy: metadata.updatedBy,
        deviceId: metadata.deviceId,
        localUpdatedAt: metadata.localUpdatedAt,
        syncState: metadata.syncState,
        offlineCreated: metadata.offlineCreated
    };
}

function getIntegrityAction(actionType, updates) {
    if (actionType === 'addReturn') {
        return 'return';
    }

    if (actionType === 'restoreArchivedInvoice') {
        return 'restore';
    }

    if (updates && updates.status === 'archived') {
        return 'archive';
    }

    return 'update';
}

async function queueInvoiceMutation(actionType, invoiceId, firestorePatch, localInvoiceSnapshot, baseUpdatedAtMillis, storeId) {
    const localUpdatedAt = new Date().toISOString();
    const payload = {
        firestorePatch: Object.assign({}, firestorePatch, {
            localUpdatedAt: localUpdatedAt
        }),
        localInvoiceSnapshot: Object.assign({}, localInvoiceSnapshot, {
            localUpdatedAt: localUpdatedAt
        }),
        baseUpdatedAtMillis: baseUpdatedAtMillis || 0,
        localUpdatedAt: localUpdatedAt
    };

    await offlineQueueService.enqueue(actionType, 'invoice', invoiceId, payload, {
        storeId: storeId || localInvoiceSnapshot.storeId || localInvoiceSnapshot.companyId || 'KORG'
    });
}

export const invoiceService = {
    async createInvoice(orderId, adjustments = {}, orderSnapshot = null) {
        try {
            const existingInvoice = await this.getInvoiceByOrderId(orderId).catch(function() {
                return null;
            });
            if (existingInvoice) {
                if (offlineStatusService.isOnline()) {
                    this.syncInvoiceWithOrder(orderId, existingInvoice).catch(function() {
                        return null;
                    });
                }
                return existingInvoice.id;
            }
            const order = orderSnapshot || await orderService.getOrderById(orderId);

            if (!order) {
                throw new Error("Order not found");
            }

            const [settings, customer, deviceId] = await Promise.all([
                settingsService.getInvoiceSettings(),
                customerService.getCustomerByName(order.customerName).catch(function() {
                    return null;
                }),
                deviceIdService.getDeviceId()
            ]);
            const user = auth.currentUser;
            const storeId = getStoreId(settings);
            const isOffline = !offlineStatusService.isOnline();
            const offlineInvoiceId = isOffline ? await deviceIdService.createOfflineEntityId(storeId) : '';
            const invoiceNumber = isOffline ? await deviceIdService.nextOfflineInvoiceNumber() : 'INV-' + Date.now().toString().substr(-6);
            const localUpdatedAt = new Date().toISOString();

            const payload = buildInvoicePayload(order, settings, customer, orderId, adjustments, invoiceNumber, qrService.generateSecureToken(), {
                id: offlineInvoiceId,
                storeId: storeId,
                companyId: storeId,
                updatedAt: isOffline ? new Date() : serverTimestamp(),
                updatedBy: user ? user.uid : '',
                deviceId: deviceId,
                localUpdatedAt: localUpdatedAt,
                syncState: isOffline ? 'offline_created' : 'synced',
                offlineCreated: isOffline
            });

            if (isOffline) {
                await offlineQueueService.enqueue('createInvoice', 'invoice', offlineInvoiceId, {
                    invoice: payload,
                    localInvoiceSnapshot: payload,
                    baseUpdatedAtMillis: 0,
                    localUpdatedAt: localUpdatedAt
                }, {
                    storeId: storeId
                });
                return offlineInvoiceId;
            }

            delete payload.id;
            const invoiceId = await dataIntegrityService.createInvoiceWithIntegrity(payload, {
                actor: getCurrentAdminActor(),
                source: 'ui',
                storeId: storeId,
                companyId: storeId
            });
            console.info('[PRICING] invoice generated with preserved price metadata');
            await gamificationService.awardAction('invoicesCreated');
            return invoiceId;
        } catch (error) {
            console.error("Error creating invoice:", error);
            throw error;
        }
    },

    async getInvoice(id) {
        const localInvoice = await offlineQueueService.getLocalInvoiceSnapshot(id);
        if (!offlineStatusService.isOnline() && localInvoice) {
            return localInvoice;
        }

        const docRef = doc(db, COLLECTION, id);
        let invoice = null;

        try {
            const snap = offlineStatusService.isOnline()
                ? await getDoc(docRef)
                : await getDocFromCache(docRef);
            if (snap.exists()) {
                invoice = Object.assign({ id: snap.id }, snap.data());
                if (invoice.orderId) {
                    const order = await orderService.getOrderById(invoice.orderId).catch(function() {
                        return null;
                    });
                    if (order) {
                        invoice = this.buildInvoiceFromOrder(invoice, order, { preserveInvoiceItems: true });
                    }
                }
            }
        } catch (error) {
            console.warn("Could not load server invoice; checking local offline queue.", error);
        }
        if (localInvoice) {
            invoice = Object.assign({}, invoice || {}, localInvoice);
        }

        const conflict = await conflictService.getOpenConflictByEntityId(id);
        if (conflict) {
            invoice = Object.assign({}, invoice || conflict.localVersion || {}, {
                id: id,
                syncState: 'sync_conflict',
                status: 'sync_conflict'
            });
        }

        return invoice;
    },

    async getWorkingInvoices() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const openQuery = query(
            collection(db, COLLECTION),
            where('status', 'in', ['draft', 'submitted', 'pending', 'approved', 'confirmed', 'fulfilled', 'returned', 'partially_returned', 'partial_return', 'fully_returned', 'return_pending', 'completed_pending_sync']),
            limit(WORKING_INVOICE_LIMIT)
        );
        const todayQuery = query(
            collection(db, COLLECTION),
            where('createdAt', '>=', today),
            limit(WORKING_INVOICE_LIMIT)
        );
        const recentQuery = query(
            collection(db, COLLECTION),
            orderBy('updatedAt', 'desc'),
            limit(RECENT_HISTORY_LIMIT)
        );

        const groups = await Promise.all([
            getDocsWithCache(openQuery, {
                collectionName: COLLECTION,
                cacheKey: 'invoices:working:open',
                timeoutMs: 45000,
                attempts: 2
            }).catch(function(error) {
                logCollectionError(COLLECTION, error, 'fetch open invoices from');
                return [];
            }),
            getDocsWithCache(todayQuery, {
                collectionName: COLLECTION,
                cacheKey: 'invoices:working:today',
                timeoutMs: 45000,
                attempts: 2
            }).catch(function(error) {
                logCollectionError(COLLECTION, error, 'fetch today invoices from');
                return [];
            }),
            getDocsWithCache(recentQuery, {
                collectionName: COLLECTION,
                cacheKey: 'invoices:working:recent',
                timeoutMs: 45000,
                attempts: 2
            }).catch(function(error) {
                logCollectionError(COLLECTION, error, 'fetch recent invoices from');
                return [];
            })
        ]);

        const byId = {};
        for (let index = 0; index < groups.length; index += 1) {
            mergeById(byId, groups[index].filter(isActiveInvoice));
        }

        return applyLocalInvoiceOverlays(Object.keys(byId).map(function(id) {
            return byId[id];
        })).then(function(invoices) {
            return invoices.filter(isActiveInvoice);
        });
    },

    async getInvoiceHistoryPage(pageSize) {
        const safeLimit = Math.min(250, Math.max(25, Number(pageSize || 50)));
        const historyQuery = query(
            collection(db, COLLECTION),
            orderBy('createdAt', 'desc'),
            limit(safeLimit)
        );
        const rows = await getDocsWithCache(historyQuery, {
            collectionName: COLLECTION,
            cacheKey: `invoices:history:${safeLimit}`,
            timeoutMs: 45000,
            attempts: 2
        });
        return applyLocalInvoiceOverlays(rows.filter(isActiveInvoice)).then(function(invoices) {
            return invoices.filter(isActiveInvoice);
        });
    },

    async getInvoicesByOrderIds(orderIds) {
        const sourceIds = Array.isArray(orderIds) ? orderIds : [];
        const uniqueIds = sourceIds.map(function(orderId) {
            return String(orderId || '').trim();
        }).filter(function(orderId, index, allIds) {
            return orderId && allIds.indexOf(orderId) === index;
        });
        const invoicesByOrderId = {};
        let startIndex = 0;

        while (startIndex < uniqueIds.length) {
            const chunk = uniqueIds.slice(startIndex, startIndex + 30);
            const invoiceQuery = query(
                collection(db, COLLECTION),
                where('orderId', 'in', chunk)
            );
            const rows = await getDocsWithCache(invoiceQuery, {
                collectionName: COLLECTION,
                cacheKey: 'invoices:orders:' + chunk.join(','),
                timeoutMs: 45000,
                attempts: 2
            });
            let rowIndex = 0;
            while (rowIndex < rows.length) {
                const invoice = rows[rowIndex];
                if (invoice && invoice.orderId && !invoicesByOrderId[invoice.orderId]) {
                    invoicesByOrderId[invoice.orderId] = invoice;
                }
                rowIndex = rowIndex + 1;
            }
            startIndex = startIndex + 30;
        }

        return uniqueIds.map(function(orderId) {
            return invoicesByOrderId[orderId] || null;
        }).filter(function(invoice) {
            return invoice !== null;
        });
    },
    async getInvoicesByCustomerNames(customerNames) {
        const names = Array.isArray(customerNames) ? customerNames : [];
        const uniqueNames = names
            .map(function(name) {
                return String(name || '').trim();
            })
            .filter(function(name, index, allNames) {
                return name && allNames.indexOf(name) === index;
            });
        const byId = {};

        for (let index = 0; index < uniqueNames.length; index += 1) {
            const customerName = uniqueNames[index];
            const customerQuery = query(
                collection(db, COLLECTION),
                where('customerName', '==', customerName),
                limit(150)
            );
            const invoices = await getDocsWithCache(customerQuery, {
                collectionName: COLLECTION,
                cacheKey: `invoices:customer:${customerName}`,
                timeoutMs: 45000,
                attempts: 2
            }).catch(function(error) {
                logCollectionError(COLLECTION, error, 'fetch customer invoices from');
                return [];
            });
            for (let invoiceIndex = 0; invoiceIndex < invoices.length; invoiceIndex += 1) {
                const invoice = invoices[invoiceIndex];
                byId[invoice.id] = invoice;
            }
        }

        return Object.keys(byId).map(function(invoiceId) {
            return byId[invoiceId];
        }).sort(sortInvoicesByNewest);
    },

    async getArchivedInvoices() {
        const archivedQuery = query(
            collection(db, COLLECTION),
            where('status', '==', 'archived'),
            limit(ARCHIVED_INVOICE_LIMIT)
        );
        const rows = await getDocsWithCache(archivedQuery, {
            collectionName: COLLECTION,
            cacheKey: 'invoices:archived',
            timeoutMs: 45000,
            attempts: 2
        });
        return rows.filter(isArchivedInvoice).sort(function(a, b) {
            return getMillis(b.archivedAt || b.updatedAt || b.createdAt) - getMillis(a.archivedAt || a.updatedAt || a.createdAt);
        });
    },

    async getAllInvoices() {
        return this.getWorkingInvoices();
    },

    normalizeInvoiceItemsForEditing(invoice) {
        return normalizeInvoiceItemsForEditing(invoice);
    },

    buildInvoiceItemFromProduct(product, quantity) {
        return buildInvoiceItemFromProduct(product, quantity);
    },

    recalculateInvoiceTotals(invoice) {
        return recalculateInvoiceTotals(invoice);
    },

    async archiveInvoice(invoiceId) {
        const intent = archiveInvoiceIntentModule.createArchiveInvoiceIntent(
            getCurrentAdminActor(),
            {
                invoiceId: invoiceId
            },
            {
                source: 'ui'
            }
        );

        return icfPipeline.run(intent);
    },

    async deleteInvoice(id) {
        return this.archiveInvoice(id);
    },

    async restoreArchivedInvoice(invoiceId) {
        return RestoreArchivedInvoiceIntent.run({
            invoiceId: invoiceId
        });
    },

    async updateInvoiceDate(id, newDate) {
        const invoice = await this.getInvoice(id);
        if (!canEditInvoiceDate(invoice)) {
            throw new Error(getInvoiceWorkflowLockMessage(invoice));
        }

        const dateObj = new Date(newDate + 'T12:00:00');
        return this.updateInvoice(id, {
            createdAt: dateObj,
            dueDate: dateObj
        }, 'updateInvoice');
    },

    async addInvoiceItem(invoiceId, product, quantity = 1) {
        const invoice = await this.getInvoice(invoiceId);
        if (!invoice) {
            throw new Error('Invoice not found.');
        }
        if (!isInvoiceItemsEditable(invoice)) {
            throw new Error(getInvoiceWorkflowLockMessage(invoice));
        }

        const items = normalizeInvoiceItemsForEditing(invoice);
        const productId = product.id || product.productId || '';
        const existingIndex = items.findIndex(item => item.productId && item.productId === productId);
        const addQuantity = Number(quantity) || 1;

        if (addQuantity <= 0) {
            throw new Error('Quantity must be a positive number.');
        }

        if (existingIndex >= 0) {
            items[existingIndex].quantity = (Number(items[existingIndex].quantity) || 0) + addQuantity;
            items[existingIndex].total = getOrderItemUnitPrice(items[existingIndex]) * items[existingIndex].quantity;
            items[existingIndex].lineSubtotal = items[existingIndex].total;
        } else {
            items.push(buildInvoiceItemFromProduct(product, addQuantity));
        }

        return this.saveInvoiceItems(invoiceId, items);
    },

    async removeInvoiceItem(invoiceId, lineItemId) {
        const invoice = await this.getInvoice(invoiceId);
        if (!invoice) {
            throw new Error('Invoice not found.');
        }
        if (!isInvoiceItemsEditable(invoice)) {
            throw new Error(getInvoiceWorkflowLockMessage(invoice));
        }

        const existingItems = normalizeInvoiceItemsForEditing(invoice);
        const removedItem = existingItems.find(item => item.lineItemId === lineItemId);
        if (getAnyReturnedQuantity(invoice, removedItem) > 0) {
            throw new Error('Returned items cannot be removed from the invoice.');
        }

        const items = existingItems
            .filter(item => item.lineItemId !== lineItemId);

        return this.saveInvoiceItems(invoiceId, items);
    },

    async updateInvoiceItemQuantity(invoiceId, lineItemId, quantity) {
        const invoice = await this.getInvoice(invoiceId);
        if (!invoice) {
            throw new Error('Invoice not found.');
        }
        if (!isInvoiceItemsEditable(invoice)) {
            throw new Error(getInvoiceWorkflowLockMessage(invoice));
        }

        const nextQuantity = Number(quantity);
        if (!Number.isFinite(nextQuantity) || nextQuantity <= 0) {
            throw new Error('Quantity must be a positive number.');
        }

        const items = normalizeInvoiceItemsForEditing(invoice).map(item => {
            if (item.lineItemId !== lineItemId) {
                return item;
            }

            return Object.assign({}, item, {
                quantity: nextQuantity,
                adjustedQuantity: nextQuantity,
                unitPrice: getOrderItemUnitPrice(item),
                price: getOrderItemUnitPrice(item),
                total: getOrderItemUnitPrice(item) * nextQuantity,
                lineSubtotal: getOrderItemUnitPrice(item) * nextQuantity
            });
        });

        return this.saveInvoiceItems(invoiceId, items);
    },

    async saveInvoiceItems(invoiceId, items) {
        const invoice = await this.getInvoice(invoiceId);
        if (!invoice) {
            throw new Error('Invoice not found.');
        }
        if (!isInvoiceItemsEditable(invoice)) {
            throw new Error(getInvoiceWorkflowLockMessage(invoice));
        }

        const existingReturnedItems = normalizeInvoiceItemsForEditing(invoice).filter(item => getAnyReturnedQuantity(invoice, item) > 0);
        for (let index = 0; index < existingReturnedItems.length; index += 1) {
            const existingItem = existingReturnedItems[index];
            const matchingItem = (items || []).find(item => {
                return (existingItem.lineItemId && item.lineItemId === existingItem.lineItemId)
                    || (existingItem.productId && item.productId === existingItem.productId);
            });
            if (!matchingItem) {
                throw new Error('Returned items cannot be removed from the invoice.');
            }
            if ((Number(matchingItem.quantity) || 0) < getAnyReturnedQuantity(invoice, existingItem)) {
                throw new Error('Quantity cannot be less than the returned quantity.');
            }
        }

        const recalculated = recalculateInvoiceTotals(Object.assign({}, invoice, {
            items: items
        }));
        const validationMessage = validateEditableItems(recalculated.items);
        if (validationMessage) {
            throw new Error(validationMessage);
        }

        const intent = updateInvoiceItemsIntentModule.createUpdateInvoiceItemsIntent(
            getCurrentAdminActor(),
            {
                invoiceId: invoiceId,
                items: recalculated.items,
                taxRate: recalculated.taxRate,
                discountType: recalculated.discountType,
                discountValue: recalculated.discountValue,
                discountAmount: recalculated.discountAmount,
                totalWeight: recalculated.totalWeight
            },
            { source: 'ui' }
        );

        const result = await icfPipeline.run(intent);
        if (!result || result.ok !== true) {
            throw new Error((result && (result.reason || result.message || (result.errors && result.errors[0]))) || 'Failed to update invoice items.');
        }

        return result;
    },

    async recordInvoiceReturn(invoiceId, returnPayload = {}) {
        const intent = recordInvoiceReturnIntentModule.createRecordInvoiceReturnIntent(
            getCurrentAdminActor(),
            {
                invoiceId: invoiceId,
                items: returnPayload.items || [],
                note: returnPayload.note || '',
                reason: returnPayload.reason || ''
            },
            { source: 'ui' }
        );

        const result = await icfPipeline.run(intent);
        if (!result || result.ok !== true) {
            throw new Error((result && (result.reason || result.message || (result.errors && result.errors[0]))) || 'Failed to record returned items.');
        }

        return result;
    },

    async getReturnedInvoicesForAnalytics() {
        const recentQuery = query(
            collection(db, COLLECTION),
            orderBy('updatedAt', 'desc'),
            limit(RETURN_ANALYTICS_LIMIT)
        );
        const rows = await getDocsWithCache(recentQuery, {
            collectionName: COLLECTION,
            cacheKey: 'invoices:returns:analytics',
            timeoutMs: 45000,
            attempts: 2
        });
        return rows.filter(function(invoice) {
            if (Array.isArray(invoice.returns) && invoice.returns.length > 0) {
                return true;
            }
            if (Array.isArray(invoice.courierReturns) && invoice.courierReturns.length > 0) {
                return true;
            }
            if (Array.isArray(invoice.returnItems) && invoice.returnItems.some(function(item) {
                return Number(item && item.quantity) > 0;
            })) {
                return true;
            }
            if (invoice.returnRequested || invoice.returnedBy || invoice.returnedAt) {
                return true;
            }
            return Number(invoice.returnSummary?.totalReturnedQuantity || 0) > 0;
        });
    },

    async updateInvoice(id, updates, actionType = 'updateInvoice') {
        try {
            const user = auth.currentUser;
            const deviceId = await deviceIdService.getDeviceId();

            if (!offlineStatusService.isOnline()) {
                const current = await this.getInvoice(id).catch(function() {
                    return { id: id };
                });
                const source = current || { id: id };
                const firestorePatch = Object.assign({}, updates);
                const localPatch = Object.assign({}, updates);

                if (actionType === 'completeInvoice') {
                    firestorePatch.status = 'fulfilled';
                    localPatch.status = 'completed_pending_sync';
                }

                const localInvoiceSnapshot = Object.assign({}, source, localPatch, {
                    id: id,
                    updatedBy: user ? user.uid : '',
                    deviceId: deviceId,
                    syncState: source.offlineCreated ? 'offline_created' : 'pending_sync'
                });

                await queueInvoiceMutation(
                    actionType,
                    id,
                    firestorePatch,
                    localInvoiceSnapshot,
                    getMillis(source.updatedAt || source.localUpdatedAt),
                    source.storeId || source.companyId || 'KORG'
                );
                return true;
            }

            const docRef = doc(db, COLLECTION, id);
            const updatePayload = Object.assign({}, updates, {
                updatedAt: serverTimestamp(),
                updatedBy: user ? user.uid : '',
                deviceId: deviceId,
                localUpdatedAt: new Date().toISOString(),
                syncState: 'synced'
            });

            if (!user && actionType === 'addReturn') {
                await updateDoc(docRef, updatePayload);
                return true;
            }

            const invoiceSnapshot = await getDoc(docRef);
            if (!invoiceSnapshot.exists()) {
                throw new Error('Invoice not found.');
            }

            const previousInvoice = Object.assign({ id: invoiceSnapshot.id }, invoiceSnapshot.data());
            if (isInvoiceReadOnly(previousInvoice) && actionType !== 'restoreArchivedInvoice') {
                throw new Error(getInvoiceWorkflowLockMessage(previousInvoice));
            }

            await dataIntegrityService.updateInvoiceWithIntegrity(docRef, previousInvoice, updatePayload, {
                action: getIntegrityAction(actionType, updates),
                actor: getCurrentAdminActor(),
                source: 'ui',
                returnItems: updates && updates.returnItems ? updates.returnItems : [],
                note: updates && updates.returnNote ? updates.returnNote : ''
            });
            return true;
        } catch (error) {
            console.error("Error updating invoice:", error);
            throw error;
        }
    },

    async syncInvoiceWithOrder(orderId, existingInvoice = null) {
        try {
            const invoice = existingInvoice || await this.getInvoiceByOrderId(orderId);
            if (!invoice) {
                return null;
            }

            const order = await orderService.getOrderById(orderId);
            if (!order) {
                throw new Error("Order not found");
            }

            const syncedInvoice = this.buildInvoiceFromOrder(invoice, order);

            await this.updateInvoice(invoice.id, {
                customerName: syncedInvoice.customerName,
                customerAddress: syncedInvoice.customerAddress,
                items: syncedInvoice.items,
                subtotal: syncedInvoice.subtotal,
                taxAmount: syncedInvoice.taxAmount,
                discountAmount: syncedInvoice.discountAmount,
                totalAmount: syncedInvoice.totalAmount
            }, 'updateInvoice');

            return invoice.id;
        } catch (error) {
            console.error("Error syncing invoice with order:", error);
            throw error;
        }
    },

    async getInvoiceByOrderId(orderId) {
        try {
            const q = query(collection(db, COLLECTION), where('orderId', '==', orderId));
            const rows = await getDocsWithCache(q, {
                collectionName: COLLECTION,
                cacheKey: `invoices:order:${orderId}`,
                timeoutMs: 45000,
                attempts: 2
            });
            if (!rows.length) {
                const localInvoices = await offlineQueueService.getLocalInvoiceSnapshots();
                const localIds = Object.keys(localInvoices);
                for (let index = 0; index < localIds.length; index += 1) {
                    const localInvoice = localInvoices[localIds[index]];
                    if (localInvoice.orderId === orderId) {
                        return localInvoice;
                    }
                }
                return null;
            }
            return rows[0];
        } catch (error) {
            console.error("Error fetching invoice by order ID:", error);
            throw error;
        }
    },

    buildInvoiceFromOrder(invoice, order, options = {}) {
        const invoiceHasItems = Array.isArray(invoice.items) && invoice.items.length > 0;
        const sourceItems = options.preserveInvoiceItems && invoiceHasItems ? invoice.items : (order.items || []);
        const items = sourceItems.map(function(item) {
            return normalizeOrderItemPricing(item);
        });
        const totals = calculateOrderTotals(items);
        const subtotal = totals.subtotal;

        const taxRate = invoice.taxRate || 0;
        const taxAmount = (subtotal * taxRate) / 100;

        let discountAmount = invoice.discountAmount || 0;
        if (invoice.discountType === 'percent' && invoice.discountValue) {
            discountAmount = (subtotal * invoice.discountValue) / 100;
        } else if (invoice.discountType === 'fixed') {
            discountAmount = invoice.discountValue || 0;
        }

        return Object.assign({}, invoice, {
            customerName: order.customerName,
            customerAddress: order.customerAddress || '',
            items: items,
            subtotal: subtotal,
            taxAmount: taxAmount,
            discountAmount: discountAmount,
            totalAmount: subtotal + taxAmount - discountAmount
        });
    }
};
