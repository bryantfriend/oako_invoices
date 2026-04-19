import { LoadingSkeleton } from "../components/loadingSkeleton.js";
import { formatCurrency, formatDate } from "../core/formatters.js";
import { qrService } from "../services/qrService.js";
import { productService } from "../services/productService.js";
import { settingsService } from "../services/settingsService.js";
import { whatsappService } from "../services/whatsappService.js";

function escapeHtml(value = '') {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function groupItems(items, productMap) {
    return items.reduce((groups, item) => {
        const product = productMap[item.productId] || {};
        const category = product.categoryName || product.category || product.categoryId || 'Other';
        if (!groups[category]) groups[category] = [];
        groups[category].push(item);
        return groups;
    }, {});
}

export const renderMobileInvoice = async ({ payload }) => {
    const app = document.getElementById('app');
    app.innerHTML = LoadingSkeleton();

    let invoice;
    let settings;
    let products;
    try {
        const decodedPayload = qrService.decodePayload(payload);
        [invoice, settings, products] = await Promise.all([
            qrService.validatePayload(decodedPayload),
            settingsService.getInvoiceSettings(),
            productService.getAllProducts()
        ]);
    } catch (error) {
        console.error('QR invoice load failed', error);
    }

    if (!invoice) {
        app.innerHTML = `
            <main style="min-height: 100vh; display: grid; place-items: center; padding: 24px; background: #f7fafc;">
                <section style="max-width: 420px; background: #fff; border-radius: 18px; padding: 24px; box-shadow: 0 18px 50px rgba(0,0,0,0.08); text-align: center;">
                    <h1 style="font-size: 22px; color: #991b1b; margin-bottom: 8px;">Invoice link expired</h1>
                    <p style="color: #64748b;">This QR code could not be validated. Please ask Kyrgyz Organics for a fresh invoice link.</p>
                </section>
            </main>
        `;
        return;
    }

    const productMap = {};
    products.forEach(product => { productMap[product.id] = product; });

    const items = (invoice.items || []).map(item => {
        const quantity = item.adjustedQuantity !== undefined ? item.adjustedQuantity : item.quantity;
        return {
            ...item,
            name: item.name || item.productName || productMap[item.productId]?.displayName || 'Product',
            quantity: Number(quantity) || 0
        };
    });
    const grouped = groupItems(items, productMap);

    app.innerHTML = `
        <main style="min-height: 100vh; background: linear-gradient(160deg, #edf7e8 0%, #f8fafc 45%, #fff7ed 100%); padding: 18px;">
            <section style="max-width: 720px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px;">
                <header style="background: #1f3a1a; color: #fff; border-radius: 24px; padding: 22px; box-shadow: 0 18px 40px rgba(31,58,26,0.18);">
                    <div style="font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.8;">Kyrgyz Organics Invoice</div>
                    <h1 style="font-size: 28px; margin: 8px 0 4px;">${escapeHtml(invoice.invoiceNumber || invoice.id)}</h1>
                    <p style="margin: 0; opacity: 0.85;">${escapeHtml(invoice.customerName || '')} · ${formatDate(invoice.createdAt)}</p>
                </header>

                <form id="mobile-reorder-form" style="background: #fff; border-radius: 22px; padding: 18px; box-shadow: 0 14px 40px rgba(15,23,42,0.08);">
                    <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 16px;">
                        <div>
                            <h2 style="margin: 0; font-size: 20px; color: #1e3318;">Re-order</h2>
                            <p style="margin: 4px 0 0; color: #64748b; font-size: 13px;">Adjust quantities, then send the order by WhatsApp.</p>
                        </div>
                        <div style="font-weight: 800; color: #15803d;">${formatCurrency(invoice.totalAmount || 0)}</div>
                    </div>

                    ${Object.entries(grouped).map(([category, categoryItems]) => `
                        <section style="border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; margin-bottom: 12px;">
                            <div style="background: #f8fafc; padding: 10px 12px; font-weight: 800; color: #334155;">${escapeHtml(category)}</div>
                            ${categoryItems.map(item => `
                                <label style="display: grid; grid-template-columns: 1fr 88px; gap: 12px; align-items: center; padding: 12px; border-top: 1px solid #eef2f7;">
                                    <span style="font-weight: 700; color: #1e293b;">${escapeHtml(item.name)}</span>
                                    <input type="number" min="0" step="1" name="${escapeHtml(item.productId || item.name)}" data-name="${escapeHtml(item.name)}" data-price="${item.price || 0}" value="${item.quantity}" style="width: 100%; border: 1px solid #cbd5e1; border-radius: 10px; padding: 8px;">
                                </label>
                            `).join('')}
                        </section>
                    `).join('')}

                    <button type="submit" style="width: 100%; border: none; border-radius: 16px; background: #16a34a; color: white; padding: 14px 16px; font-weight: 900; font-size: 16px;">
                        Re-order on WhatsApp
                    </button>
                </form>
            </section>
        </main>
    `;

    document.getElementById('mobile-reorder-form').addEventListener('submit', (event) => {
        event.preventDefault();
        const inputs = [...event.currentTarget.querySelectorAll('input[type="number"]')];
        const selectedItems = inputs.map(input => ({
            name: input.dataset.name,
            quantity: Number(input.value) || 0,
            price: Number(input.dataset.price) || 0
        })).filter(item => item.quantity > 0);
        const total = selectedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const link = whatsappService.buildOrderLink(settings.whatsappNumber || settings.phone, {
            items: selectedItems,
            total,
            invoiceNumber: invoice.invoiceNumber || invoice.id
        });
        window.location.href = link;
    });
};
