import { customerService } from "../services/customerService.js";
import { notificationService } from "../core/notificationService.js";
import { t } from "../core/i18n.js";
import { router } from "../router.js";
import { ROUTES } from "../core/constants.js";
import { gamificationService } from "../services/gamificationService.js";

function safeNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function getReturnAmountFromInvoice(invoice = {}) {
    if (invoice.returnSummary && invoice.returnSummary.totalReturnedAmount !== undefined) {
        return safeNumber(invoice.returnSummary.totalReturnedAmount, 0);
    }

    return (Array.isArray(invoice.returns) ? invoice.returns : []).reduce(function(sum, returnRecord) {
        return sum + safeNumber(returnRecord.totalReturnedAmount, 0);
    }, 0);
}

function getStatementDate(value) {
    if (!value) {
        return new Date(0);
    }
    if (value.toDate) {
        return value.toDate();
    }
    if (value.seconds) {
        return new Date(value.seconds * 1000);
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return new Date(0);
    }
    return date;
}

function buildReturnRows(invoices = []) {
    const rows = [];

    invoices.forEach(function(invoice) {
        const returnRecords = Array.isArray(invoice.returns) ? invoice.returns : [];
        returnRecords.forEach(function(returnRecord) {
            const items = Array.isArray(returnRecord.items) ? returnRecord.items : [];
            rows.push({
                id: returnRecord.returnId || `${invoice.id}-return-${rows.length + 1}`,
                invoiceId: invoice.id,
                invoiceNumber: invoice.invoiceNumber || '',
                createdAt: returnRecord.createdAt || returnRecord.returnedAt || invoice.updatedAt,
                totalReturnedQuantity: safeNumber(returnRecord.totalReturnedQuantity, 0),
                totalReturnedAmount: safeNumber(returnRecord.totalReturnedAmount, 0),
                reason: returnRecord.reason || '',
                note: returnRecord.note || '',
                itemSummary: items.map(function(item) {
                    const name = item.productName || item.name || item.displayName || 'Product';
                    const quantity = safeNumber(item.returnedQuantity || item.quantity, 0);
                    return `${name} x ${quantity}`;
                }).join(', ')
            });
        });
    });

    return rows.sort(function(a, b) {
        return getStatementDate(b.createdAt) - getStatementDate(a.createdAt);
    });
}

function buildPaymentRows(orders = []) {
    return orders
        .filter(function(order) {
            return order.status === 'paid';
        })
        .map(function(order) {
            return {
                id: order.id,
                orderId: order.id,
                paidAt: order.paidAt || order.fulfilledAt || order.updatedAt || order.createdAt,
                amount: safeNumber(order.totalAmount, 0),
                status: order.status
            };
        })
        .sort(function(a, b) {
            return getStatementDate(b.paidAt) - getStatementDate(a.paidAt);
        });
}

export const customerController = {
    generateCustomerPin() {
        return customerService.generateCustomerPin();
    },

    async loadAllCustomers() {
        try {
            return await customerService.getAllCustomers();
        } catch (error) {
            notificationService.error(t('msg_load_fail'));
            return [];
        }
    },

    async handleCreateCustomer(data) {
        try {
            if (!data.name) {
                notificationService.error(t('val_required'));
                return;
            }
            await customerService.createCustomer(data);
            await gamificationService.awardAction('customersCreated');
            notificationService.success(t('msg_save_success'));
            // Refresh or navigate logic dependent on where it's called
            return true;
        } catch (error) {
            notificationService.error(t('msg_save_fail'));
            return false;
        }
    },

    async handleUpdateCustomer(id, data) {
        try {
            await customerService.updateCustomer(id, data);
            notificationService.success(t('msg_update_success'));
            return true;
        } catch (error) {
            notificationService.error(t('msg_update_fail'));
            return false;
        }
    },

    async getCustomerById(id) {
        try {
            return await customerService.getCustomerById(id);
        } catch (error) {
            notificationService.error(t('msg_load_fail'));
            return null;
        }
    },


    // For auto-fill features
    async searchByName(term) {
        return await customerService.searchCustomers(term);
    },

    async archiveCustomer(id) {
        try {
            await customerService.deleteCustomer(id);
            notificationService.success('Customer archived.');
        } catch (error) {
            notificationService.error('Failed to archive customer.');
        }
    },

    async handleDeleteCustomer(id) {
        try {
            await customerService.deleteCustomer(id);
            notificationService.success('Customer archived.');
            return true;
        } catch (error) {
            notificationService.error('Failed to archive customer.');
            return false;
        }
    },

    async loadCustomerDetail(id) {
        try {
            const customer = await customerService.getCustomerById(id);
            if (!customer) return null;

            // Fetch orders
            const { orderService } = await import("../services/orderService.js");
            const { invoiceService } = await import("../services/invoiceService.js");
            const lookupNames = [...new Set([customer.companyName, customer.name].filter(Boolean))];
            const orderGroups = await Promise.all(lookupNames.map(name => orderService.getOrdersByCustomerName(name).catch(() => [])));
            const orderMap = new Map();
            orderGroups.flat().forEach(order => orderMap.set(order.id, order));
            const orders = [...orderMap.values()].sort((a, b) => {
                const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || a.orderDate || 0);
                const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || b.orderDate || 0);
                return dateB - dateA;
            });
            const invoices = await invoiceService.getInvoicesByCustomerNames(lookupNames).catch(function(error) {
                console.warn("Could not load customer invoices.", error);
                return [];
            });
            const returns = buildReturnRows(invoices);
            const payments = buildPaymentRows(orders);

            // Calculate Stats
            const invoiceSales = invoices.reduce(function(sum, invoice) {
                return sum + safeNumber(invoice.totalAmount, 0);
            }, 0);
            const fallbackOrderSales = orders.reduce(function(sum, order) {
                return sum + safeNumber(order.totalAmount, 0);
            }, 0);
            const totalRevenue = invoiceSales || fallbackOrderSales;
            const totalReturns = returns.reduce(function(sum, returnRow) {
                return sum + safeNumber(returnRow.totalReturnedAmount, 0);
            }, 0);
            const totalPayments = payments.reduce(function(sum, payment) {
                return sum + safeNumber(payment.amount, 0);
            }, 0);
            const outstandingBalance = Math.max(0, totalRevenue - totalReturns - totalPayments);
            const totalOrders = orders.length;
            const lastOrderDate = orders.length > 0 ? (orders[0].orderDate || orders[0].createdAt) : null;
            const productTotals = orders.reduce((totals, order) => {
                (order.items || []).forEach(item => {
                    const key = item.productId || item.name;
                    if (!totals[key]) {
                        totals[key] = {
                            productId: item.productId || '',
                            name: item.name || item.productName || 'Product',
                            quantity: 0,
                            count: 0
                        };
                    }
                    totals[key].quantity += Number(item.adjustedQuantity !== undefined ? item.adjustedQuantity : item.quantity) || 0;
                    totals[key].count += 1;
                });
                return totals;
            }, {});
            const mostOrderedProducts = Object.values(productTotals)
                .sort((a, b) => b.quantity - a.quantity)
                .slice(0, 5);

            return {
                customer,
                orders,
                invoices,
                returns,
                payments,
                stats: {
                    totalRevenue,
                    totalSales: totalRevenue,
                    totalReturns,
                    totalPayments,
                    outstandingBalance,
                    totalOrders,
                    lastOrderDate,
                    invoiceCount: invoices.length,
                    returnCount: returns.length,
                    paymentCount: payments.length
                },
                mostOrderedProducts
            };
        } catch (error) {
            console.error("Error loading customer detail:", error);
            notificationService.error(t('msg_load_fail'));
            return null;
        }
    }

};
