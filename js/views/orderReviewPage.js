import { invoiceApprovalController } from "../controllers/invoiceApprovalController.js";
import { LoadingSkeleton } from "../components/loadingSkeleton.js";
import { formatCurrency, formatDate } from "../core/formatters.js";

function escapeHtml(value = '') {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getTokenFromUrl() {
    return new URLSearchParams(window.location.search).get('token') || '';
}

function shell(content) {
    return `
        <main class="approval-review-app">
            <style>
                html, body {
                    margin: 0;
                    min-height: 100%;
                    background: #eef6ea;
                    color: #193018;
                    font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                }
                #app { min-height: 100vh; }
                .approval-review-app {
                    min-height: 100dvh;
                    padding: 20px;
                    background: linear-gradient(155deg, #dfeeda 0%, #f8fafc 54%, #fff3dc 100%);
                    box-sizing: border-box;
                }
                .approval-shell {
                    max-width: 760px;
                    margin: 0 auto;
                    display: grid;
                    gap: 14px;
                }
                .approval-hero {
                    border-radius: 8px;
                    padding: 22px;
                    background: #1e3318;
                    color: #fff;
                    box-shadow: 0 20px 50px rgba(15, 23, 42, 0.14);
                }
                .approval-kicker {
                    font-size: 11px;
                    font-weight: 900;
                    text-transform: uppercase;
                    letter-spacing: 0.08em;
                    color: rgba(255,255,255,0.72);
                }
                .approval-title {
                    margin: 7px 0 4px;
                    font-size: 28px;
                    line-height: 1.1;
                }
                .approval-subtitle {
                    margin: 0;
                    color: rgba(255,255,255,0.82);
                    font-size: 14px;
                    line-height: 1.45;
                }
                .approval-card {
                    background: rgba(255,255,255,0.96);
                    border: 1px solid rgba(226,232,240,0.95);
                    border-radius: 8px;
                    padding: 18px;
                    box-shadow: 0 14px 40px rgba(15, 23, 42, 0.08);
                }
                .approval-row {
                    display: grid;
                    grid-template-columns: 1fr auto;
                    gap: 12px;
                    padding: 12px 0;
                    border-bottom: 1px solid #edf2f7;
                    align-items: center;
                }
                .approval-row:last-child { border-bottom: 0; }
                .approval-actions {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
                    gap: 10px;
                }
                .approval-button {
                    border: 0;
                    border-radius: 8px;
                    padding: 13px 14px;
                    font-size: 15px;
                    font-weight: 900;
                    color: #fff;
                    background: #166534;
                    cursor: pointer;
                }
                .approval-button.secondary { background: #334155; }
                .approval-button:disabled { opacity: 0.64; cursor: not-allowed; }
                .approval-input, .approval-textarea {
                    width: 100%;
                    box-sizing: border-box;
                    border: 1px solid #cbd5e1;
                    border-radius: 8px;
                    padding: 10px;
                    background: #fff;
                    color: #1e293b;
                }
                .approval-qty {
                    width: 92px;
                    box-sizing: border-box;
                    border: 1px solid #cbd5e1;
                    border-radius: 8px;
                    padding: 9px;
                    font-size: 15px;
                    font-weight: 900;
                    text-align: center;
                }
                .approval-error {
                    min-height: 18px;
                    color: #b91c1c;
                    font-size: 13px;
                    font-weight: 800;
                }
                @media (max-width: 520px) {
                    .approval-review-app { padding: 12px; }
                    .approval-title { font-size: 24px; }
                    .approval-row { grid-template-columns: 1fr; }
                    .approval-qty { width: 100%; }
                }
            </style>
            <section class="approval-shell">${content}</section>
        </main>
    `;
}

function renderInvalid(message) {
    return shell(`
        <section class="approval-card" style="text-align: center;">
            <h1 style="margin: 0 0 8px; color: #991b1b; font-size: 22px;">${escapeHtml(message || 'This approval link has expired.')}</h1>
            <p style="margin: 0; color: #64748b; font-size: 14px;">Please ask Kyrgyz Organics for a fresh approval link.</p>
        </section>
    `);
}

function renderInvoiceRows(items, editable) {
    return items.map(function(item, index) {
        const quantity = Number(item.quantity) || 0;
        return `
            <div class="approval-row">
                <div>
                    <div style="font-size: 15px; font-weight: 900; color: #1e293b;">${escapeHtml(item.name || 'Product')}</div>
                    <div style="font-size: 12px; color: #64748b; margin-top: 3px;">${quantity} x ${formatCurrency(Number(item.price) || 0)}</div>
                </div>
                ${editable ? `
                    <input class="approval-qty" type="number" min="0" step="1" value="${quantity}" data-index="${index}" data-product-id="${escapeHtml(item.productId || '')}" data-name="${escapeHtml(item.name || 'Product')}" data-original-quantity="${quantity}">
                ` : `
                    <strong style="font-size: 15px; color: #1e3318;">${formatCurrency(quantity * (Number(item.price) || 0))}</strong>
                `}
            </div>
        `;
    }).join('');
}

function renderSubmitted(review) {
    const link = review.approvalLink || {};
    const invoice = review.invoice || {};
    const title = link.status === 'modified' ? 'Changes submitted' : 'Order accepted';
    return shell(`
        <header class="approval-hero">
            <div class="approval-kicker">Kyrgyz Organics</div>
            <h1 class="approval-title">${escapeHtml(title)}</h1>
            <p class="approval-subtitle">${escapeHtml(invoice.invoiceNumber || invoice.invoiceId || 'Invoice')} · ${escapeHtml(invoice.customerName || 'Customer')}</p>
        </header>
        <section class="approval-card">
            <p style="margin: 0; color: #475569;">Your response has already been sent. Thank you.</p>
        </section>
    `);
}

function collectModifiedItems(items) {
    return [...document.querySelectorAll('.approval-qty')].map(function(input) {
        const originalQuantity = Number(input.dataset.originalQuantity) || 0;
        return {
            productId: input.dataset.productId || '',
            name: input.dataset.name || 'Product',
            originalQuantity: originalQuantity,
            requestedQuantity: Math.max(0, Number(input.value) || 0)
        };
    }).filter(function(item) {
        return item.originalQuantity !== item.requestedQuantity;
    });
}

function renderReview(review, token) {
    const invoice = review.invoice || {};
    const items = invoice.items || [];
    const app = document.getElementById('app');

    if (review.approvalLink && review.approvalLink.status !== 'pending') {
        app.innerHTML = renderSubmitted(review);
        return;
    }

    app.innerHTML = shell(`
        <header class="approval-hero">
            <div class="approval-kicker">Kyrgyz Organics Order Review</div>
            <h1 class="approval-title">${escapeHtml(invoice.invoiceNumber || 'Invoice')}</h1>
            <p class="approval-subtitle">${escapeHtml(invoice.customerName || 'Customer')} · ${formatDate(invoice.createdAt)}</p>
        </header>

        <section class="approval-card">
            <h2 style="margin: 0 0 10px; font-size: 18px;">Invoice Contents</h2>
            ${renderInvoiceRows(items, false)}
            <div class="approval-row" style="font-size: 18px;">
                <strong>Total</strong>
                <strong>${formatCurrency(invoice.totalAmount || 0)}</strong>
            </div>
        </section>

        <section class="approval-card">
            <div class="approval-actions">
                <button id="accept-order" class="approval-button" type="button">Accept Order</button>
                <button id="show-modify-form" class="approval-button secondary" type="button">Modify Order</button>
            </div>
            <div id="approval-error" class="approval-error" style="margin-top: 10px;"></div>
        </section>

        <form id="modify-order-form" class="approval-card" style="display: none;">
            <h2 style="margin: 0 0 10px; font-size: 18px;">Requested Changes</h2>
            <p style="margin: 0 0 12px; color: #64748b; font-size: 13px;">Adjust quantities and add notes. Full invoice editing is not available on this page.</p>
            ${renderInvoiceRows(items, true)}
            <label style="display: grid; gap: 6px; margin-top: 12px;">
                <span style="font-size: 12px; font-weight: 900; color: #334155;">Notes</span>
                <textarea id="customer-notes" class="approval-textarea" rows="4" placeholder="Tell us what should change"></textarea>
            </label>
            <div id="modify-error" class="approval-error" style="margin-top: 10px;"></div>
            <button id="submit-modified-order" class="approval-button" type="submit" style="margin-top: 10px;">Submit Changes</button>
        </form>
    `);

    document.getElementById('accept-order').addEventListener('click', async function() {
        const button = document.getElementById('accept-order');
        button.disabled = true;
        button.textContent = 'Submitting...';
        try {
            await invoiceApprovalController.submitCustomerResponse(token, 'accepted', null);
            app.innerHTML = renderSubmitted({
                invoice: invoice,
                approvalLink: {
                    status: 'accepted'
                }
            });
        } catch (error) {
            document.getElementById('approval-error').textContent = error.message || 'Could not submit response.';
            button.disabled = false;
            button.textContent = 'Accept Order';
        }
    });

    document.getElementById('show-modify-form').addEventListener('click', function() {
        document.getElementById('modify-order-form').style.display = 'block';
        document.getElementById('modify-order-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    document.getElementById('modify-order-form').addEventListener('submit', async function(event) {
        event.preventDefault();
        const notes = document.getElementById('customer-notes').value.trim();
        const modifiedItems = collectModifiedItems(items);
        if (!notes && modifiedItems.length === 0) {
            document.getElementById('modify-error').textContent = 'Change at least one quantity or add a note.';
            return;
        }

        const button = document.getElementById('submit-modified-order');
        button.disabled = true;
        button.textContent = 'Submitting...';
        try {
            await invoiceApprovalController.submitCustomerResponse(token, 'modified', {
                notes: notes,
                modifiedItems: modifiedItems
            });
            app.innerHTML = renderSubmitted({
                invoice: invoice,
                approvalLink: {
                    status: 'modified'
                }
            });
        } catch (error) {
            document.getElementById('modify-error').textContent = error.message || 'Could not submit changes.';
            button.disabled = false;
            button.textContent = 'Submit Changes';
        }
    });
}

async function init() {
    const app = document.getElementById('app');
    const token = getTokenFromUrl();
    app.innerHTML = LoadingSkeleton();

    if (!token) {
        app.innerHTML = renderInvalid('This approval link has expired.');
        return;
    }

    try {
        const review = await invoiceApprovalController.loadCustomerReview(token);
        if (!review.ok) {
            app.innerHTML = renderInvalid(review.reason);
            return;
        }
        renderReview(review, token);
    } catch (error) {
        console.error('Approval review failed.', error);
        app.innerHTML = renderInvalid('This approval link has expired.');
    }
}

document.addEventListener('DOMContentLoaded', init);
