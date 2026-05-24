import { auth, db } from "../core/firebase.js";
import {
    collection,
    addDoc,
    getDocs,
    getDoc,
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
import icfPipeline from "../ICF/engine/pipeline.js";
import archiveInvoiceIntentModule from "../ICF/Intents/ArchiveInvoiceIntent.js";

const COLLECTION = 'invoices';
const WORKING_INVOICE_LIMIT = 120;
const RECENT_HISTORY_LIMIT = 60;
const ARCHIVED_INVOICE_LIMIT = 200;

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

function mergeById(target, invoices) {
    for (let index = 0; index < invoices.length; index += 1) {
        const invoice = invoices[index];
        if (invoice && invoice.id) {
            target[invoice.id] = Object.assign({}, target[invoice.id] || {}, invoice);
        }
    }
}

function mapSnapshot(snapshot) {
    return snapshot.docs.map(function(documentSnapshot) {
        return Object.assign({ id: documentSnapshot.id }, documentSnapshot.data());
    });
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
    await invoiceService.updateInvoice(context.invoiceId, {
        status: restoreStatus,
        restoredAt: serverTimestamp(),
        restoredBy: getActorId(context.currentUser)
    }, 'restoreArchivedInvoice');

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
    const subtotal = order.totalAmount || 0;
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
    const invoiceDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0);

    return {
        id: metadata.id || '',
        orderId: orderId,
        invoiceNumber: invoiceNumber,
        customerName: order.customerName,
        customerAddress: order.customerAddress || '',
        customerPinCode: customer && customer.pinCode ? customer.pinCode : '',
        items: order.items || [],
        subtotal: subtotal,
        taxRate: taxRate,
        taxAmount: taxAmount,
        discountType: adjustments.discountType || 'none',
        discountValue: adjustments.discountValue || 0,
        discountAmount: discountAmount,
        totalAmount: totalAmount,
        status: 'pending',
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
            if (offlineStatusService.isOnline()) {
                const existingQuery = query(collection(db, COLLECTION), where('orderId', '==', orderId));
                const existing = await getDocs(existingQuery).catch(function() {
                    return { empty: true, docs: [] };
                });

                if (!existing.empty) {
                    const existingInvoice = Object.assign({ id: existing.docs[0].id }, existing.docs[0].data());
                    await this.syncInvoiceWithOrder(orderId, existingInvoice).catch(function() {
                        return null;
                    });
                    return existingInvoice.id;
                }
            }

            const localExistingInvoice = await this.getInvoiceByOrderId(orderId).catch(function() {
                return null;
            });
            if (localExistingInvoice) {
                return localExistingInvoice.id;
            }

            const order = orderSnapshot || await orderService.getOrderById(orderId);
            const settings = await settingsService.getInvoiceSettings();

            if (!order) {
                throw new Error("Order not found");
            }

            const customer = await customerService.getCustomerByName(order.customerName).catch(function() {
                return null;
            });
            const user = auth.currentUser;
            const deviceId = await deviceIdService.getDeviceId();
            const storeId = getStoreId(settings);
            const isOffline = !offlineStatusService.isOnline();
            const invoiceId = isOffline ? await deviceIdService.createOfflineEntityId(storeId) : '';
            const invoiceNumber = isOffline ? await deviceIdService.nextOfflineInvoiceNumber() : 'INV-' + Date.now().toString().substr(-6);
            const localUpdatedAt = new Date().toISOString();

            const payload = buildInvoicePayload(order, settings, customer, orderId, adjustments, invoiceNumber, qrService.generateSecureToken(), {
                id: invoiceId,
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
                await offlineQueueService.enqueue('createInvoice', 'invoice', invoiceId, {
                    invoice: payload,
                    localInvoiceSnapshot: payload,
                    baseUpdatedAtMillis: 0,
                    localUpdatedAt: localUpdatedAt
                }, {
                    storeId: storeId
                });
                return invoiceId;
            }

            delete payload.id;
            const docRef = await addDoc(collection(db, COLLECTION), payload);
            await gamificationService.awardAction('invoicesCreated');
            return docRef.id;
        } catch (error) {
            console.error("Error creating invoice:", error);
            throw error;
        }
    },

    async getInvoice(id) {
        const docRef = doc(db, COLLECTION, id);
        let invoice = null;

        try {
            const snap = await getDoc(docRef);
            if (snap.exists()) {
                invoice = Object.assign({ id: snap.id }, snap.data());
                if (invoice.orderId) {
                    const order = await orderService.getOrderById(invoice.orderId).catch(function() {
                        return null;
                    });
                    if (order) {
                        invoice = this.buildInvoiceFromOrder(invoice, order);
                    }
                }
            }
        } catch (error) {
            console.warn("Could not load server invoice; checking local offline queue.", error);
        }

        const localInvoice = await offlineQueueService.getLocalInvoiceSnapshot(id);
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
            where('status', 'in', ['pending', 'draft', 'confirmed', 'return_pending', 'completed_pending_sync']),
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
            getDocs(openQuery).then(mapSnapshot).catch(function(error) {
                console.warn("Open invoice query failed.", error);
                return [];
            }),
            getDocs(todayQuery).then(mapSnapshot).catch(function(error) {
                console.warn("Today invoice query failed.", error);
                return [];
            }),
            getDocs(recentQuery).then(mapSnapshot).catch(function(error) {
                console.warn("Recent invoice query failed.", error);
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
        const snapshot = await getDocs(historyQuery);
        return applyLocalInvoiceOverlays(mapSnapshot(snapshot).filter(isActiveInvoice)).then(function(invoices) {
            return invoices.filter(isActiveInvoice);
        });
    },

    async getArchivedInvoices() {
        const archivedQuery = query(
            collection(db, COLLECTION),
            where('status', '==', 'archived'),
            limit(ARCHIVED_INVOICE_LIMIT)
        );
        const snapshot = await getDocs(archivedQuery);
        return mapSnapshot(snapshot).filter(isArchivedInvoice).sort(function(a, b) {
            return getMillis(b.archivedAt || b.updatedAt || b.createdAt) - getMillis(a.archivedAt || a.updatedAt || a.createdAt);
        });
    },

    async getAllInvoices() {
        return this.getWorkingInvoices();
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
        const dateObj = new Date(newDate + 'T12:00:00');
        return this.updateInvoice(id, {
            createdAt: dateObj,
            dueDate: dateObj
        }, 'updateInvoice');
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
                    firestorePatch.status = 'completed';
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
            await updateDoc(docRef, Object.assign({}, updates, {
                updatedAt: serverTimestamp(),
                updatedBy: user ? user.uid : '',
                deviceId: deviceId,
                localUpdatedAt: new Date().toISOString(),
                syncState: 'synced'
            }));
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
            const snap = await getDocs(q);
            if (snap.empty) {
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
            const first = snap.docs[0];
            return Object.assign({ id: first.id }, first.data());
        } catch (error) {
            console.error("Error fetching invoice by order ID:", error);
            throw error;
        }
    },

    buildInvoiceFromOrder(invoice, order) {
        const items = order.items || [];
        const subtotal = items.reduce(function(sum, item) {
            const finalQty = item.adjustedQuantity !== undefined ? item.adjustedQuantity : item.quantity;
            return sum + ((item.price || 0) * finalQty);
        }, 0);

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
