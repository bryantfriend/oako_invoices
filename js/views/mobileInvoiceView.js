import { LoadingSkeleton } from "../components/loadingSkeleton.js";
import { formatCurrency, formatDate } from "../core/formatters.js";
import { pinService } from "../services/pinService.js";
import { productService } from "../services/productService.js";
import { qrActivityService } from "../services/qrActivityService.js";
import { qrService } from "../services/qrService.js";
import { returnsService } from "../services/returnsService.js";
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

function getQuantity(item) {
    return Number(item.adjustedQuantity !== undefined ? item.adjustedQuantity : item.quantity) || 0;
}

function buildProductMap(products = []) {
    return products.reduce((map, product) => {
        map[product.id] = product;
        return map;
    }, {});
}

function normalizeItems(invoice, productMap) {
    return (invoice.items || []).map(item => {
        const product = productMap[item.productId] || {};
        return {
            ...item,
            name: item.name || item.productName || product.displayName || 'Product',
            category: product.categoryName || product.category || product.categoryId || 'Other',
            imageUrl: item.imageUrl || product.imageUrl || product.photoUrl || '',
            quantity: getQuantity(item),
            price: Number(item.price) || Number(product.price) || 0
        };
    });
}

function groupItems(items = []) {
    return items.reduce((groups, item) => {
        const category = item.category || 'Other';
        if (!groups[category]) groups[category] = [];
        groups[category].push(item);
        return groups;
    }, {});
}

function getSelectedItems(form) {
    return [...form.querySelectorAll('input[type="number"]')]
        .map(input => ({
            productId: input.dataset.productId,
            name: input.dataset.name,
            quantity: Number(input.value) || 0,
            price: Number(input.dataset.price) || 0
        }))
        .filter(item => item.quantity > 0);
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = src;
    });
}

async function compressPhoto(file) {
    if (!file) return null;
    const source = await readFileAsDataUrl(file);
    const image = await loadImage(source);
    const maxSize = 900;
    const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    return {
        name: file.name,
        dataUrl: canvas.toDataURL('image/jpeg', 0.68),
        capturedAt: new Date().toISOString()
    };
}

function mobileShell(content) {
    return `
        <main class="qr-app">
            <style>
                body { margin: 0; background: #eef6ea; }
                .qr-app {
                    min-height: 100vh;
                    padding: 18px;
                    background:
                        radial-gradient(circle at top left, rgba(255,255,255,0.95), transparent 34%),
                        linear-gradient(155deg, #dfeeda 0%, #f8fafc 48%, #fff3dc 100%);
                    color: #193018;
                    box-sizing: border-box;
                    font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                }
                .qr-shell { max-width: 540px; margin: 0 auto; display: flex; flex-direction: column; gap: 14px; }
                .qr-hero {
                    position: relative;
                    overflow: hidden;
                    border-radius: 28px;
                    padding: 24px;
                    color: #fff;
                    background: linear-gradient(135deg, #183719 0%, #256f3b 58%, #f59e0b 140%);
                    box-shadow: 0 24px 60px rgba(24, 55, 25, 0.24);
                }
                .qr-hero::after {
                    content: "";
                    position: absolute;
                    width: 190px;
                    height: 190px;
                    right: -80px;
                    top: -70px;
                    border-radius: 50%;
                    background: rgba(255, 255, 255, 0.12);
                }
                .qr-kicker { font-size: 11px; font-weight: 900; letter-spacing: 0.12em; text-transform: uppercase; opacity: 0.78; }
                .qr-title { margin: 8px 0 4px; font-size: 28px; line-height: 1.05; letter-spacing: -0.04em; }
                .qr-subtitle { margin: 0; color: rgba(255,255,255,0.82); font-size: 14px; line-height: 1.5; }
                .qr-card {
                    background: rgba(255,255,255,0.94);
                    border: 1px solid rgba(255,255,255,0.9);
                    border-radius: 24px;
                    padding: 18px;
                    box-shadow: 0 18px 45px rgba(15, 23, 42, 0.08);
                    backdrop-filter: blur(14px);
                }
                .qr-button {
                    width: 100%;
                    border: 0;
                    border-radius: 20px;
                    padding: 16px;
                    font-size: 16px;
                    font-weight: 950;
                    color: #fff;
                    background: linear-gradient(135deg, #15803d, #22c55e);
                    box-shadow: 0 14px 28px rgba(21, 128, 61, 0.25);
                    cursor: pointer;
                }
                .qr-button.secondary { background: linear-gradient(135deg, #334155, #0f172a); box-shadow: 0 14px 28px rgba(15, 23, 42, 0.18); }
                .qr-button.warning { background: linear-gradient(135deg, #b45309, #f59e0b); box-shadow: 0 14px 28px rgba(180, 83, 9, 0.22); }
                .qr-button.ghost { color: #24522d; background: #ecfdf3; box-shadow: none; border: 1px solid #bbf7d0; }
                .qr-actions { display: grid; gap: 12px; }
                .qr-field {
                    width: 100%;
                    box-sizing: border-box;
                    border: 1px solid #cbd5e1;
                    border-radius: 18px;
                    padding: 15px 16px;
                    font-size: 22px;
                    font-weight: 900;
                    text-align: center;
                    letter-spacing: 0.24em;
                    color: #172554;
                    background: #fff;
                }
                .qr-section-title { margin: 0 0 8px; font-size: 20px; letter-spacing: -0.03em; }
                .qr-note { margin: 0 0 14px; color: #64748b; font-size: 13px; line-height: 1.45; }
                .qr-category {
                    overflow: hidden;
                    border: 1px solid #e2e8f0;
                    border-radius: 18px;
                    margin-bottom: 12px;
                    background: #fff;
                }
                .qr-category-head {
                    padding: 10px 12px;
                    background: #f8fafc;
                    color: #334155;
                    font-size: 12px;
                    font-weight: 950;
                    text-transform: uppercase;
                    letter-spacing: 0.08em;
                }
                .qr-product {
                    display: grid;
                    grid-template-columns: 58px 1fr;
                    gap: 12px;
                    padding: 12px;
                    border-top: 1px solid #eef2f7;
                }
                .qr-product-img {
                    width: 58px;
                    height: 58px;
                    border-radius: 16px;
                    background: linear-gradient(135deg, #dcfce7, #fef3c7);
                    object-fit: cover;
                    display: grid;
                    place-items: center;
                    color: #166534;
                    font-weight: 950;
                }
                .qr-product-main { min-width: 0; }
                .qr-product-title { font-size: 15px; font-weight: 950; color: #1e293b; line-height: 1.2; }
                .qr-product-meta { display: block; color: #64748b; font-size: 12px; margin-top: 3px; }
                .qr-stepper {
                    display: grid;
                    grid-template-columns: 42px 1fr 42px;
                    gap: 7px;
                    margin-top: 10px;
                }
                .qr-stepper button {
                    border: 0;
                    border-radius: 13px;
                    background: #dcfce7;
                    color: #166534;
                    font-size: 19px;
                    font-weight: 950;
                }
                .qr-qty {
                    width: 100%;
                    box-sizing: border-box;
                    border: 1px solid #cbd5e1;
                    border-radius: 14px;
                    padding: 10px;
                    font-size: 16px;
                    font-weight: 900;
                    text-align: center;
                }
                .qr-list-row {
                    display: flex;
                    justify-content: space-between;
                    gap: 12px;
                    padding: 12px 0;
                    border-bottom: 1px solid #edf2f7;
                    font-size: 14px;
                }
                .qr-error { color: #b91c1c; font-size: 13px; font-weight: 800; min-height: 18px; text-align: center; }
                .qr-pill {
                    display: inline-flex;
                    align-items: center;
                    border-radius: 999px;
                    padding: 7px 10px;
                    background: #ecfdf3;
                    color: #166534;
                    font-size: 12px;
                    font-weight: 900;
                    margin-top: 12px;
                }
                .qr-textarea, .qr-file {
                    width: 100%;
                    box-sizing: border-box;
                    border: 1px solid #cbd5e1;
                    border-radius: 16px;
                    padding: 12px;
                    background: #fff;
                }
                @media (max-width: 420px) {
                    .qr-app { padding: 12px; }
                    .qr-hero { padding: 21px; border-radius: 24px; }
                    .qr-title { font-size: 25px; }
                    .qr-card { padding: 15px; border-radius: 22px; }
                }
            </style>
            <section class="qr-shell">${content}</section>
        </main>
    `;
}

export const renderMobileInvoice = async ({ payload, mode = 'customer' }) => {
    const app = document.getElementById('app');
    app.innerHTML = LoadingSkeleton();

    let invoice;
    let settings;
    let products;
    const preferredMode = mode === 'courier' ? 'courier' : 'customer';

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
        app.innerHTML = mobileShell(`
            <section class="qr-card" style="text-align: center;">
                <h1 class="qr-section-title" style="color: #991b1b;">Invoice link expired</h1>
                <p class="qr-note">This QR code could not be validated. Please ask Kyrgyz Organics for a fresh invoice link.</p>
            </section>
        `);
        return;
    }

    await qrActivityService.log('qr_opened', {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        mode: preferredMode
    });

    const productMap = buildProductMap(products);
    const items = normalizeItems(invoice, productMap);
    const groupedItems = groupItems(items);
    let session = null;

    const logAction = (action, extra = {}) => qrActivityService.log(action, {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        role: session?.role || 'unknown',
        mode: preferredMode,
        ...extra
    });

    const renderHero = (title, subtitle) => `
        <header class="qr-hero">
            <div class="qr-kicker">Kyrgyz Organics ${preferredMode === 'courier' ? 'Courier QR' : 'Customer QR'}</div>
            <h1 class="qr-title">${escapeHtml(title)}</h1>
            <p class="qr-subtitle">${escapeHtml(subtitle)}</p>
            ${session ? `<span class="qr-pill">${session.role === 'courier' ? 'Courier mode' : 'Customer mode'}</span>` : ''}
        </header>
    `;

    const renderPasscode = (error = '') => {
        app.innerHTML = mobileShell(`
            ${renderHero('Secure invoice access', `${invoice.invoiceNumber || invoice.id} for ${invoice.customerName || 'customer'}`)}
            <form id="qr-pin-form" class="qr-card">
                <h2 class="qr-section-title">Enter passcode</h2>
                <p class="qr-note">${preferredMode === 'courier'
                    ? 'Enter the courier PIN. You can also type it with # in front.'
                    : 'Enter the 6-digit customer/company PIN for this invoice.'}</p>
                <input class="qr-field" id="qr-pin-input" name="pin" inputmode="numeric" autocomplete="one-time-code" placeholder="123456" maxlength="7" required>
                <div class="qr-error">${escapeHtml(error)}</div>
                <button class="qr-button" type="submit">Unlock invoice</button>
            </form>
        `);

        document.getElementById('qr-pin-form').addEventListener('submit', async (event) => {
            event.preventDefault();
            const result = pinService.authenticateInvoice(document.getElementById('qr-pin-input').value, invoice, settings, preferredMode);
            await qrActivityService.log('pin_attempt', {
                invoiceId: invoice.id,
                invoiceNumber: invoice.invoiceNumber,
                role: result.role || preferredMode,
                mode: preferredMode,
                success: result.ok
            });
            if (!result.ok) {
                renderPasscode(result.reason);
                return;
            }
            session = result;
            renderMenu();
        });
    };

    const renderMenu = () => {
        app.innerHTML = mobileShell(`
            ${renderHero('Choose an action', `${invoice.customerName || 'Customer'} · ${formatDate(invoice.createdAt)}`)}
            <section class="qr-card qr-actions">
                <button class="qr-button secondary" id="qr-view-invoice">View invoice</button>
                <button class="qr-button warning" id="qr-request-return">Request Return</button>
                <button class="qr-button" id="qr-new-order">New Order</button>
            </section>
        `);

        document.getElementById('qr-view-invoice').addEventListener('click', () => {
            logAction('view_invoice');
            renderInvoiceDetails();
        });
        document.getElementById('qr-request-return').addEventListener('click', renderReturnForm);
        document.getElementById('qr-new-order').addEventListener('click', renderReorderForm);
    };

    const renderInvoiceDetails = () => {
        app.innerHTML = mobileShell(`
            ${renderHero('Invoice details', `${invoice.invoiceNumber || invoice.id} · ${formatDate(invoice.createdAt)}`)}
            <section class="qr-card">
                <h2 class="qr-section-title">${escapeHtml(invoice.customerName || 'Customer')}</h2>
                <p class="qr-note">Status: ${escapeHtml(invoice.status || 'pending')}</p>
                ${items.map(item => `
                    <div class="qr-list-row">
                        <strong>${escapeHtml(item.name)}</strong>
                        <span>${item.quantity} x ${formatCurrency(item.price)}</span>
                    </div>
                `).join('')}
                <div class="qr-list-row" style="border-bottom: 0; font-size: 17px;">
                    <strong>Total</strong>
                    <strong>${formatCurrency(invoice.totalAmount || 0)}</strong>
                </div>
                <button class="qr-button ghost" id="qr-back">Back to actions</button>
            </section>
        `);
        document.getElementById('qr-back').addEventListener('click', renderMenu);
    };

    const attachSteppers = (formId) => {
        document.querySelectorAll(`#${formId} .qr-stepper-btn`).forEach(button => {
            button.addEventListener('click', () => {
                const input = document.getElementById(button.dataset.target);
                const direction = Number(button.dataset.direction);
                const max = input.max ? Number(input.max) : Infinity;
                const next = Math.max(0, Math.min(max, (Number(input.value) || 0) + direction));
                input.value = next;
            });
        });
    };

    const renderQuantityForm = ({ title, note, buttonText, formId, mode: formMode }) => `
        ${renderHero(title, `${invoice.invoiceNumber || invoice.id} · ${invoice.customerName || 'Customer'}`)}
        <form id="${formId}" class="qr-card">
            <h2 class="qr-section-title">${escapeHtml(title)}</h2>
            <p class="qr-note">${escapeHtml(note)}</p>
            ${Object.entries(groupedItems).map(([category, categoryItems]) => `
                <section class="qr-category">
                    <div class="qr-category-head">${escapeHtml(category)}</div>
                    ${categoryItems.map((item, index) => {
                        const value = formMode === 'return' ? 0 : item.quantity;
                        const inputId = `${formId}-${index}-${String(item.productId || item.name).replace(/[^a-zA-Z0-9]/g, '')}`;
                        return `
                            <div class="qr-product">
                                ${item.imageUrl
                                    ? `<img class="qr-product-img" src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name)}">`
                                    : `<div class="qr-product-img">${escapeHtml(item.name.charAt(0))}</div>`}
                                <div class="qr-product-main">
                                    <div class="qr-product-title">${escapeHtml(item.name)}</div>
                                    <small class="qr-product-meta">Ordered: ${item.quantity} · ${formatCurrency(item.price)}</small>
                                    <div class="qr-stepper">
                                        <button type="button" class="qr-stepper-btn" data-target="${inputId}" data-direction="-1">-</button>
                                        <input id="${inputId}" class="qr-qty" type="number" min="0" ${formMode === 'return' ? `max="${item.quantity}"` : ''} step="1" value="${value}" data-product-id="${escapeHtml(item.productId || item.name)}" data-name="${escapeHtml(item.name)}" data-price="${item.price}">
                                        <button type="button" class="qr-stepper-btn" data-target="${inputId}" data-direction="1">+</button>
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </section>
            `).join('')}
            ${formMode === 'return' && session?.role === 'courier' ? `
                <div style="display: grid; gap: 10px; margin-bottom: 12px;">
                    <label>
                        <span style="display:block; font-size:12px; font-weight:900; color:#334155; margin-bottom:6px;">Courier note</span>
                        <textarea id="qr-return-note" class="qr-textarea" rows="3" placeholder="Optional note about the return"></textarea>
                    </label>
                    <label>
                        <span style="display:block; font-size:12px; font-weight:900; color:#334155; margin-bottom:6px;">Photo proof</span>
                        <input id="qr-return-photo" class="qr-file" type="file" accept="image/*" capture="environment">
                    </label>
                </div>
            ` : ''}
            <div class="qr-error" id="${formId}-error"></div>
            <button class="qr-button" type="submit">${escapeHtml(buttonText)}</button>
            <button class="qr-button ghost" id="${formId}-back" type="button" style="margin-top: 10px;">Back to actions</button>
        </form>
    `;

    const renderWhatsAppPreview = ({ title, message, link, actionName }) => {
        app.innerHTML = mobileShell(`
            ${renderHero(title, 'Review the message before WhatsApp opens.')}
            <section class="qr-card">
                <h2 class="qr-section-title">Ready to send</h2>
                <pre style="white-space: pre-wrap; font-family: inherit; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 18px; padding: 14px; color: #334155;">${escapeHtml(message)}</pre>
                <button class="qr-button" id="qr-send-whatsapp">Open WhatsApp</button>
                <button class="qr-button ghost" id="qr-preview-back" style="margin-top: 10px;">Back to actions</button>
            </section>
        `);
        document.getElementById('qr-send-whatsapp').addEventListener('click', () => {
            logAction(actionName);
            window.location.href = link;
        });
        document.getElementById('qr-preview-back').addEventListener('click', renderMenu);
    };

    const renderReturnForm = () => {
        const isCourier = session?.role === 'courier';
        app.innerHTML = mobileShell(renderQuantityForm({
            title: 'Request return',
            note: isCourier
                ? 'Select returned items, add optional photo proof, then save directly to the invoice.'
                : 'Select the items you want to return. You will review the WhatsApp request before sending.',
            buttonText: isCourier ? 'Save return' : 'Review return request',
            formId: 'qr-return-form',
            mode: 'return'
        }));

        attachSteppers('qr-return-form');
        document.getElementById('qr-return-form-back').addEventListener('click', renderMenu);
        document.getElementById('qr-return-form').addEventListener('submit', async (event) => {
            event.preventDefault();
            const selectedItems = getSelectedItems(event.currentTarget);
            if (selectedItems.length === 0) {
                document.getElementById('qr-return-form-error').textContent = 'Choose at least one item.';
                return;
            }

            if (isCourier) {
                const photoInput = document.getElementById('qr-return-photo');
                const returnPhotos = [];
                if (photoInput?.files?.[0]) {
                    const compressed = await compressPhoto(photoInput.files[0]).catch(() => null);
                    if (compressed && compressed.dataUrl.length < 500000) {
                        returnPhotos.push(compressed);
                    }
                }

                await returnsService.requestReturn(invoice.id, selectedItems, {
                    returnPhotos,
                    returnNote: document.getElementById('qr-return-note')?.value || '',
                    returnedBy: 'courier'
                });
                await logAction('courier_return_saved');
                invoice.returnRequested = true;
                invoice.returnItems = selectedItems.map(item => ({ productId: item.productId, quantity: item.quantity }));
                invoice.returnPhotos = returnPhotos;
                invoice.status = 'return_pending';
                app.innerHTML = mobileShell(`
                    ${renderHero('Return saved', 'The invoice return request was updated in Firestore.')}
                    <section class="qr-card">
                        <h2 class="qr-section-title">Saved return</h2>
                        ${selectedItems.map(item => `<div class="qr-list-row"><strong>${escapeHtml(item.name)}</strong><span>x${item.quantity}</span></div>`).join('')}
                        <p class="qr-note" style="margin-top: 12px;">Photo proof: ${returnPhotos.length ? 'attached' : 'not attached'}</p>
                        <button class="qr-button" id="qr-done">Back to actions</button>
                    </section>
                `);
                document.getElementById('qr-done').addEventListener('click', renderMenu);
                return;
            }

            const message = whatsappService.buildReturnMessage({
                items: selectedItems,
                invoiceNumber: invoice.invoiceNumber || invoice.id,
                customerName: invoice.customerName || ''
            });
            renderWhatsAppPreview({
                title: 'Return request preview',
                message,
                link: whatsappService.buildReturnLink(settings.whatsappNumber || settings.phone, {
                    items: selectedItems,
                    invoiceNumber: invoice.invoiceNumber || invoice.id,
                    customerName: invoice.customerName || ''
                }),
                actionName: 'customer_return_whatsapp_opened'
            });
        });
    };

    const renderReorderForm = () => {
        app.innerHTML = mobileShell(renderQuantityForm({
            title: 'New order',
            note: 'Keep the same quantities or adjust them. You will review the WhatsApp order before sending.',
            buttonText: 'Review re-order',
            formId: 'qr-reorder-form',
            mode: 'reorder'
        }));

        attachSteppers('qr-reorder-form');
        document.getElementById('qr-reorder-form-back').addEventListener('click', renderMenu);
        document.getElementById('qr-reorder-form').addEventListener('submit', (event) => {
            event.preventDefault();
            const selectedItems = getSelectedItems(event.currentTarget);
            if (selectedItems.length === 0) {
                document.getElementById('qr-reorder-form-error').textContent = 'Choose at least one item.';
                return;
            }

            const total = selectedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            const message = whatsappService.buildOrderMessage({
                items: selectedItems,
                total,
                invoiceNumber: invoice.invoiceNumber || invoice.id
            });
            renderWhatsAppPreview({
                title: 'Re-order preview',
                message,
                link: whatsappService.buildOrderLink(settings.whatsappNumber || settings.phone, {
                    items: selectedItems,
                    total,
                    invoiceNumber: invoice.invoiceNumber || invoice.id
                }),
                actionName: 'reorder_whatsapp_opened'
            });
        });
    };

    renderPasscode();
};
