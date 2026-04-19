import { formatCurrency } from "../core/formatters.js";

export const whatsappService = {
    normalizeNumber(number = '') {
        return String(number).replace(/[^\d]/g, '');
    },

    buildOrderMessage({ items = [], total = 0, invoiceNumber = '' }) {
        const lines = [
            'Hello, I would like to place an order:',
            '',
            ...items
                .filter(item => (Number(item.quantity) || 0) > 0)
                .map(item => `${item.name} x${Number(item.quantity) || 0}`),
            '',
            `Total: ${formatCurrency(total)}`,
            `Invoice Ref: ${invoiceNumber}`
        ];

        return lines.join('\n');
    },

    buildOrderLink(number, orderDetails) {
        const phone = this.normalizeNumber(number);
        const message = this.buildOrderMessage(orderDetails);
        return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    },

    buildReturnMessage({ items = [], invoiceNumber = '', customerName = '' }) {
        const lines = [
            'Hello, I would like to request a return:',
            '',
            ...items
                .filter(item => (Number(item.quantity) || 0) > 0)
                .map(item => `${item.name} x${Number(item.quantity) || 0}`),
            '',
            `Invoice Ref: ${invoiceNumber}`,
            customerName ? `Customer: ${customerName}` : ''
        ].filter(line => line !== '');

        return lines.join('\n');
    },

    buildReturnLink(number, returnDetails) {
        const phone = this.normalizeNumber(number);
        const message = this.buildReturnMessage(returnDetails);
        return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    }
};
