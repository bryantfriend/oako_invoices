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
    deleteDoc,
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

const COLLECTION = 'invoices';
const WORKING_INVOICE_LIMIT = 120;
const RECENT_HISTORY_LIMIT = 60;

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
    async createInvoice(orderId, adjustments = {}) {
        try {
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

            const localExistingInvoice = await this.getInvoiceByOrderId(orderId).catch(function() {
                return null;
            });
            if (localExistingInvoice) {
                return localExistingInvoice.id;
            }

            const order = await orderService.getOrderById(orderId);
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
            mergeById(byId, groups[index]);
        }

        return applyLocalInvoiceOverlays(Object.keys(byId).map(function(id) {
            return byId[id];
        }));
    },

    async getInvoiceHistoryPage(pageSize) {
        const safeLimit = Math.min(250, Math.max(25, Number(pageSize || 50)));
        const historyQuery = query(
            collection(db, COLLECTION),
            orderBy('createdAt', 'desc'),
            limit(safeLimit)
        );
        const snapshot = await getDocs(historyQuery);
        return applyLocalInvoiceOverlays(mapSnapshot(snapshot));
    },

    async getAllInvoices() {
        return this.getWorkingInvoices();
    },

    async deleteInvoice(id) {
        try {
            const docRef = doc(db, COLLECTION, id);
            await deleteDoc(docRef);
            return true;
        } catch (error) {
            console.error("Error deleting invoice:", error);
            throw error;
        }
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
