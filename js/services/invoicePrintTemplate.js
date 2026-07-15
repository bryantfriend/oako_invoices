import { formatDate, formatCurrency } from "../core/formatters.js";
import { t } from "../core/i18n.js";

var DEFAULT_ITEMS_PER_PAGE = 7;

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function safeImageUrl(value) {
    var text = String(value || '').trim();
    if (!text) {
        return '';
    }
    if (text.indexOf('data:image/') === 0 || text.indexOf('blob:') === 0 || text.indexOf('https://') === 0 || text.indexOf('http://') === 0 || text.indexOf('/') === 0 || text.indexOf('./') === 0) {
        return escapeHtml(text);
    }
    return '';
}

function renderBankInfo(value) {
    return escapeHtml(value || '').replace(/\r?\n/g, '<br>');
}

function getItemQuantity(item) {
    if (item.adjustedQuantity !== undefined && item.adjustedQuantity !== null) {
        return Number(item.adjustedQuantity) || 0;
    }
    if (item.remainingQuantity !== undefined && item.remainingQuantity !== null) {
        return Number(item.remainingQuantity) || 0;
    }
    var originalQuantity = Number(item.quantity) || 0;
    var returnedQuantity = Number(item.returnedQuantity || item.returnQuantity || 0);
    return Math.max(0, originalQuantity - returnedQuantity);
}

function getItemName(item, language) {
    if (language === 'ru') {
        return item.name_ru || item.name_en || item.displayName || item.name || 'Product';
    }
    if (language === 'kg') {
        return item.name_kg || item.name_en || item.displayName || item.name || 'Product';
    }
    return item.name_en || item.displayName || item.name || 'Product';
}

function getSettings(invoice, settings) {
    return Object.assign({}, invoice && invoice.settings ? invoice.settings : {}, settings || {});
}

function paginateItems(items, itemsPerPage) {
    var pages = [];
    var index = 0;
    while (index < items.length) {
        pages.push(items.slice(index, index + itemsPerPage));
        index = index + itemsPerPage;
    }
    if (pages.length === 0) {
        pages.push([]);
    }
    return pages;
}

function calculateSubtotal(items) {
    var subtotal = 0;
    var index = 0;
    while (index < items.length) {
        subtotal = subtotal + (Number(items[index].price) || 0) * getItemQuantity(items[index]);
        index = index + 1;
    }
    return subtotal;
}

function getNotes(settings, language) {
    if (language === 'kg') {
        return settings.notesKg || 'Төлөм 30 күндүн ичинде.';
    }
    if (language === 'ru') {
        return settings.notesRu || 'Оплата в течение 30 дней.';
    }
    return settings.notesEn || 'Payment due within 30 days.';
}

function renderInvoicePage(invoice, settings, language, pageItems, pageNumber, totalPages, options) {
    var isFirst = pageNumber === 1;
    var isLast = pageNumber === totalPages;
    var invoiceNumber = escapeHtml(invoice.invoiceNumber || '');
    var invoiceQr = safeImageUrl(invoice.invoiceQrDataUrl || '');
    var logoUrl = safeImageUrl(settings.logoUrl);
    var paymentQr = safeImageUrl(settings.paymentQrImageUrl);
    var subtotal = options.subtotal;
    var taxRate = Number(invoice.taxRate || 0);
    var taxAmount = subtotal * taxRate / 100;
    var discountAmount = Number(invoice.discountAmount || 0);
    if (invoice.discountType === 'percent' && invoice.discountValue) {
        discountAmount = subtotal * Number(invoice.discountValue) / 100;
    }
    var grandTotal = Number(invoice.totalAmount);
    if (!Number.isFinite(grandTotal)) {
        grandTotal = subtotal + taxAmount - discountAmount;
    }
    var activeClass = pageNumber === options.currentPage ? ' active-page' : '';
    var displayStyle = options.showAllPages || pageNumber === options.currentPage ? 'block' : 'none';
    var positionStyle = options.showAllPages || pageNumber === options.currentPage ? '' : 'position:absolute;top:-10000px;';

    return `
        <div class="invoice-page${activeClass}" data-page="${pageNumber}" data-invoice-number="${invoiceNumber}" style="background:#fff;padding:30px 40px;height:296mm;width:210mm;margin:0 auto;color:#1e3318;font-family:'Inter',Arial,sans-serif;position:relative;box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;display:${displayStyle};transform:scale(${options.scale});transform-origin:top center;${positionStyle}">
            <div style="display:grid;grid-template-columns:1fr 170px 1fr;align-items:start;gap:20px;margin-bottom:14px;min-height:166px;">
                <div>
                    <div style="width:180px;min-height:42px;">${logoUrl ? `<img src="${logoUrl}" alt="Company logo" style="max-width:100%;max-height:90px;display:block;object-fit:contain;">` : '<div style="background:#ebf0e9;border-radius:6px;padding:12px;color:#5a7052;font-weight:800;">Kyrgyz Organics</div>'}</div>
                    <div style="font-size:11px;color:#5a7052;margin-top:12px;line-height:1.5;">${escapeHtml(settings.address || 'Republic of Kyrgyzstan')}<br>${escapeHtml(settings.phone || '')}</div>
                </div>
                <div style="text-align:center;">
                    <div style="display:inline-block;padding:8px;background:#fff;border:2px solid #2e4a23;border-radius:10px;">
                        <img class="invoice-qr-image" src="${invoiceQr}" alt="Invoice ${invoiceNumber} QR" data-invoice-number="${invoiceNumber}" style="width:132px;height:132px;display:block;object-fit:contain;">
                    </div>
                    <div style="font-size:9px;font-weight:900;color:#2e4a23;margin-top:5px;">INVOICE ${invoiceNumber}</div>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:15px;font-weight:800;">${t('print_invoice', language)} #${invoiceNumber}${options.isCopy ? ' (Copy)' : ''}</div>
                    <div style="font-size:11px;color:#5a7052;margin-top:5px;">${t('print_date', language)}: ${formatDate(invoice.createdAt)}</div>
                    <div style="font-size:11px;color:#5a7052;">Status: ${escapeHtml(invoice.status || 'pending')}</div>
                    ${totalPages > 1 ? `<div style="font-size:11px;color:#5a7052;">Page ${pageNumber} / ${totalPages}</div>` : ''}
                </div>
            </div>

            ${isFirst ? `
                <h2 style="font-size:20px;font-weight:600;margin:0 0 10px;border-bottom:2px solid #ebf0e9;padding-bottom:5px;">${t('print_invoice', language)}</h2>
                <div style="display:flex;justify-content:space-between;gap:20px;margin-bottom:15px;">
                    <div style="flex:1;">
                        <div style="font-size:9px;font-weight:800;text-transform:uppercase;color:#5a7052;letter-spacing:1px;">${t('print_bill_to', language)}</div>
                        <div style="font-size:16px;font-weight:800;margin-top:6px;">${escapeHtml(invoice.customerName || '')}</div>
                        <div style="font-size:11px;color:#435a3c;margin-top:4px;">${escapeHtml(invoice.customerAddress || 'Republic of Kyrgyzstan')}</div>
                    </div>
                    <div style="min-width:220px;border:1px solid #d8e2d4;border-radius:8px;padding:12px;">
                        <div style="font-size:8px;color:#5a7052;font-weight:800;text-transform:uppercase;">TOTAL DUE</div>
                        <div style="font-size:22px;font-weight:900;margin-top:4px;">${formatCurrency(grandTotal)}</div>
                    </div>
                </div>
            ` : ''}

            <table style="width:100%;border-collapse:collapse;margin-bottom:14px;">
                <thead><tr style="background:#f8faf6;color:#5a7052;font-size:9px;text-transform:uppercase;">
                    <th style="padding:7px 10px;text-align:left;">${t('print_description', language)}</th>
                    <th style="padding:7px 10px;text-align:center;width:80px;">${t('print_quantity', language)}</th>
                    <th style="padding:7px 10px;text-align:right;width:110px;">${t('print_unit_price', language)}</th>
                    <th style="padding:7px 10px;text-align:right;width:120px;">${t('print_total', language)}</th>
                </tr></thead>
                <tbody style="font-size:12px;">${pageItems.map(function(item, index) {
                    var quantity = getItemQuantity(item);
                    var price = Number(item.price) || 0;
                    return `<tr style="background:${index % 2 === 0 ? '#fafaf8' : '#fff'};border-bottom:1px solid #e2e8e0;"><td style="padding:7px 10px;font-weight:700;overflow-wrap:anywhere;">${escapeHtml(getItemName(item, language))}${item.weight ? `<div style="font-size:9px;color:#5a7052;margin-top:2px;">${escapeHtml(item.weight)}</div>` : ''}${Number(item.returnedQuantity || item.returnQuantity || 0) > 0 ? `<div style="font-size:9px;color:#991b1b;margin-top:2px;">Returned: ${Number(item.returnedQuantity || item.returnQuantity || 0)}</div>` : ''}</td><td style="padding:7px 10px;text-align:center;">${quantity}</td><td style="padding:7px 10px;text-align:right;">${formatCurrency(price)}</td><td style="padding:7px 10px;text-align:right;font-weight:800;">${formatCurrency(price * quantity)}</td></tr>`;
                }).join('')}</tbody>
            </table>

            ${isLast ? `
                <div style="display:flex;justify-content:flex-end;margin:14px 0 20px;page-break-inside:avoid;">
                    <div style="width:290px;">
                        <div style="display:flex;justify-content:space-between;padding:6px 12px;border-bottom:1px solid #e2e8e0;"><span>${t('print_subtotal', language)}</span><strong>${formatCurrency(subtotal)}</strong></div>
                        ${taxAmount > 0 ? `<div style="display:flex;justify-content:space-between;padding:6px 12px;border-bottom:1px solid #e2e8e0;"><span>${t('print_vat', language)} (${taxRate}%)</span><strong>${formatCurrency(taxAmount)}</strong></div>` : ''}
                        <div style="display:flex;justify-content:space-between;padding:12px;background:#2e4a23;color:#fff;border-radius:4px;margin-top:9px;"><strong>${t('print_grand_total', language)}</strong><strong style="font-size:19px;">${formatCurrency(grandTotal)}</strong></div>
                    </div>
                </div>
                <div style="display:grid;grid-template-columns:1fr auto;gap:24px;border-top:1px solid #e2e8e0;padding-top:14px;page-break-inside:avoid;">
                    <div>
                        <div style="font-size:9px;font-weight:800;text-transform:uppercase;color:#5a7052;">${t('print_notes', language)}</div>
                        <div style="font-size:11px;color:#5a7052;line-height:1.5;margin-top:6px;">${escapeHtml(getNotes(settings, language))}</div>
                        <div style="font-size:10px;line-height:1.55;margin-top:8px;background:#fafbf9;border:1px solid #ebf0e9;border-radius:6px;padding:10px;">${renderBankInfo(settings.bankInfo || '')}</div>
                        ${invoice.notes ? `<div style="font-size:10px;margin-top:7px;"><strong>Invoice note:</strong> ${escapeHtml(invoice.notes)}</div>` : ''}
                        <div style="display:flex;gap:28px;margin-top:22px;font-size:10px;"><span>Prepared by: ____________________</span><span>Customer signature: ____________________</span></div>
                    </div>
                    ${paymentQr && settings.showQrCode !== false ? `<div style="text-align:center;"><img src="${paymentQr}" alt="Payment QR" style="width:100px;height:100px;object-fit:contain;display:block;"><div style="font-size:8px;font-weight:800;margin-top:3px;">${t('print_scan_pay', language)}</div></div>` : ''}
                </div>
            ` : ''}
            ${settings.showFooter !== false ? `<div style="position:absolute;bottom:18px;left:30px;right:30px;text-align:center;color:#5a7052;font-size:10px;">&mdash; ${escapeHtml(settings.footerText || t('print_thanks', language))} &mdash;</div>` : ''}
        </div>
    `;
}

function buildInvoicePrintPages(options) {
    var invoice = options && options.invoice ? options.invoice : {};
    var settings = getSettings(invoice, options ? options.settings : {});
    var language = options && options.language ? options.language : 'en';
    var items = Array.isArray(invoice.items) ? invoice.items : [];
    var itemsPerPage = Math.min(30, Math.max(1, parseInt(settings.invoiceItemsPerPage, 10) || DEFAULT_ITEMS_PER_PAGE));
    var itemPages = paginateItems(items, itemsPerPage);
    var subtotal = calculateSubtotal(items);
    var renderOptions = {
        currentPage: options && options.currentPage ? options.currentPage : 1,
        scale: options && options.scale ? options.scale : 1,
        showAllPages: options && options.showAllPages === true,
        isCopy: options && options.isCopy === true,
        subtotal: subtotal
    };
    var rendered = [];
    var index = 0;

    if (!invoice.invoiceQrDataUrl) {
        throw new Error('Invoice ' + String(invoice.invoiceNumber || invoice.id || '') + ' is missing its prepared QR image.');
    }

    while (index < itemPages.length) {
        rendered.push(renderInvoicePage(invoice, settings, language, itemPages[index], index + 1, itemPages.length, renderOptions));
        index = index + 1;
    }
    return rendered;
}

export { buildInvoicePrintPages };
export default {
    buildInvoicePrintPages: buildInvoicePrintPages
};
