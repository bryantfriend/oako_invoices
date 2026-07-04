import { orderService } from "../services/orderService.js";
import { invoiceService } from "../services/invoiceService.js";
import { notificationService } from "../core/notificationService.js";
import { ORDER_STATUS } from "../core/constants.js";
import { t } from "../core/i18n.js";
import { gamificationService } from "../services/gamificationService.js";
import sessionDataStore from "../services/sessionDataStore.js";
import { calculateOrderTotals, getOrderItemUnitPrice, normalizeOrderItemPricing } from "../core/pricing.js";

export const orderDetailController = {
    async loadOrder(id) {
        try {
            const order = await orderService.getOrderById(id);
            if (!order) {
                notificationService.error(t('msg_load_fail'));
                return null;
            }
            const invoice = await invoiceService.getInvoiceByOrderId(id).catch(() => null);
            if (!invoice) {
                return order;
            }

            return {
                ...order,
                items: (order.items || []).map(item => {
                    const invoiceItem = (invoice.items || []).find(entry => {
                        return (item.lineItemId && entry.lineItemId === item.lineItemId)
                            || (item.productId && entry.productId === item.productId);
                    });
                    return {
                        ...item,
                        returnedQuantity: invoiceItem ? Number(invoiceItem.returnedQuantity || 0) : Number(item.returnedQuantity || item.returnQuantity || 0),
                        returnQuantity: invoiceItem ? Number(invoiceItem.returnedQuantity || 0) : Number(item.returnQuantity || item.returnedQuantity || 0)
                    };
                }),
                returnSummary: invoice.returnSummary || order.returnSummary,
                returns: invoice.returns || order.returns
            };
        } catch (error) {
            notificationService.error(t('msg_load_fail'));
            return null;
        }
    },

    async updateStatus(id, newStatus) {
        try {
            await orderService.updateOrderStatus(id, newStatus);
            sessionDataStore.updateOrderRecord(id, { status: newStatus, updatedAt: new Date() }, 'update-order-status');
            if (newStatus === ORDER_STATUS.FULFILLED) {
                await gamificationService.awardAction('ordersFulfilled');
            }
            if (newStatus === ORDER_STATUS.PAID) {
                await gamificationService.awardAction('ordersPaid');
            }
            notificationService.success(t('msg_update_success'));
            return true;
        } catch (error) {
            notificationService.error(t('msg_update_fail'));
            return false;
        }
    },

    async updateOrderItems(id, items) {
        try {
            if (!Array.isArray(items) || items.length === 0) {
                notificationService.error('Order must have at least one product.');
                return false;
            }

            const normalizedItems = items.map((item, index) => {
                const quantity = parseInt(item.quantity, 10) || 0;
                const adjustedQuantity = item.adjustedQuantity !== undefined
                    ? parseInt(item.adjustedQuantity, 10) || 0
                    : quantity;
                const unitPrice = getOrderItemUnitPrice(item);
                const normalized = normalizeOrderItemPricing(Object.assign({}, item, {
                    lineItemId: item.lineItemId || item.productId || `line-${index}`,
                    quantity,
                    adjustedQuantity,
                    unitPrice,
                    price: unitPrice,
                    total: adjustedQuantity * unitPrice,
                    lineSubtotal: adjustedQuantity * unitPrice
                }));
                normalized.adjustedQuantity = adjustedQuantity;
                normalized.total = adjustedQuantity * unitPrice;
                normalized.lineSubtotal = normalized.total;
                return normalized;
            }).filter(item => item.adjustedQuantity > 0);

            if (normalizedItems.length === 0) {
                notificationService.error('Order must have at least one product with a positive quantity.');
                return false;
            }

            const totals = calculateOrderTotals(normalizedItems);
            await orderService.updateOrder(id, {
                items: normalizedItems,
                totalAmount: totals.totalAmount,
                subtotal: totals.subtotal
            });
            await invoiceService.syncInvoiceWithOrder(id).catch(() => null);
            sessionDataStore.updateOrderRecord(id, {
                items: normalizedItems,
                totalAmount: calculateOrderTotals(normalizedItems).totalAmount,
                updatedAt: new Date()
            }, 'update-order-items');
            await sessionDataStore.invalidateInvoicesCache('order-items-changed');
            notificationService.success(t('msg_update_success'));
            return true;
        } catch (error) {
            notificationService.error(t('msg_update_fail'));
            return false;
        }
    },

    async updateQuantities(id, items) {
        return this.updateOrderItems(id, items);
    },

    async generateInvoice(id) {
        // Validation: Order must be confirmed
        // Then navigate to invoice view or trigger generation
        // For now, assume it navigates
        return true;
    },

    async updateNotes(id, notes) {
        try {
            await orderService.updateOrder(id, { notes });
            sessionDataStore.updateOrderRecord(id, { notes: notes, updatedAt: new Date() }, 'update-order-notes');
            notificationService.success(t('msg_update_success'));
            return true;
        } catch (error) {
            notificationService.error(t('msg_update_fail'));
            return false;
        }
    }
};
