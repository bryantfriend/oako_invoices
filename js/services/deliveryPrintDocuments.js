function escapeHtml(value) {
    return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function remainingQuantity(item) {
    if (item.adjustedQuantity !== undefined && item.adjustedQuantity !== null) return Math.max(0, Number(item.adjustedQuantity) || 0);
    if (item.remainingQuantity !== undefined && item.remainingQuantity !== null) return Math.max(0, Number(item.remainingQuantity) || 0);
    return Math.max(0, (Number(item.quantity) || 0) - (Number(item.returnedQuantity || item.returnQuantity) || 0));
}

export function buildDeliveryDocuments(invoices, profile) {
    var packing = '';
    var labels = '';
    for (var invoice of invoices) {
        var heading = '<h2>' + escapeHtml(invoice.customerName) + '</h2><p>' + escapeHtml(invoice.customerAddress || 'Address not recorded') + '<br>' + escapeHtml(invoice.customerPhone || '') + '</p><p>Invoice ' + escapeHtml(invoice.invoiceNumber) + '</p>';
        var rows = '';
        for (var item of invoice.items || []) {
            var quantity = remainingQuantity(item);
            if (!quantity) continue;
            rows += '<tr><td>' + escapeHtml(item.name_en || item.displayName || item.name || item.name_ru || 'Product') + '</td><td>' + quantity + ' ' + escapeHtml(item.unit || '') + '</td><td>□</td></tr>';
        }
        packing += '<section><h1>Packing list</h1>' + heading + '<table><thead><tr><th>Product</th><th>Quantity</th><th>Packed</th></tr></thead><tbody>' + rows + '</tbody></table><p>Prepared by: __________________</p></section>';
        labels += '<section>' + heading + '</section>';
    }
    var style = 'body{font-family:Arial,sans-serif;color:#111;margin:0}section{break-after:page}section:last-child{break-after:auto}h1{font-size:22px}h2{font-size:16px;margin:0 0 6px}p{margin:6px 0;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse}td,th{padding:8px;border-bottom:1px solid #ccc;text-align:left}tr{break-inside:avoid}';
    return {
        packing: '<!doctype html><html><head><meta charset="utf-8"><title>Packing lists</title><style>@page{size:' + profile.paperSize + ';margin:12mm}' + style + '</style></head><body>' + packing + '</body></html>',
        labels: '<!doctype html><html><head><meta charset="utf-8"><title>Delivery labels</title><style>@page{size:' + profile.labelWidth + 'mm ' + profile.labelHeight + 'mm;margin:5mm}' + style + 'body{font-size:11px}h2{font-size:14px}</style></head><body>' + labels + '</body></html>'
    };
}
