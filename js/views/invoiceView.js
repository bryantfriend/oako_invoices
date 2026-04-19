import { layoutView } from "./layoutView.js";
import { invoiceController } from "../controllers/invoiceController.js";
import { LoadingSkeleton } from "../components/loadingSkeleton.js";
import { formatDate, formatCurrency } from "../core/formatters.js";
import { createCard } from "../components/card.js";
import { createStatusBadge } from "../components/statusBadge.js";
import { DataTable } from "../components/dataTable.js";
import { t, i18n } from "../core/i18n.js";

import { router } from "../router.js";
import { ROUTES } from "../core/constants.js";
import { productService } from "../services/productService.js";
import { qrService } from "../services/qrService.js";
import { settingsService } from "../services/settingsService.js";

function buildGoogleSheetUrl(sheetId) {
    return sheetId ? `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/edit` : '';
}

export const renderInvoices = async () => {
    layoutView.render();
    layoutView.updateTitle(t('invoice_title'));
    const container = document.getElementById('page-container');
    container.innerHTML = LoadingSkeleton();

    // Load Data
    const [allInvoices, allOrders, invoiceSettings] = await Promise.all([
        invoiceController.loadAllInvoices(),
        import("../services/orderService.js").then(m => m.orderService.getAllOrders()),
        settingsService.getInvoiceSettings()
    ]);
    const googleSheetUrl = buildGoogleSheetUrl(invoiceSettings.googleSheetId);

    const orderMap = {};
    allOrders.forEach(o => orderMap[o.id] = o);
    allInvoices.forEach(inv => {
        inv.isPrinted = (orderMap[inv.orderId] && orderMap[inv.orderId].isPrinted) || false;
    });

    const customers = [...new Set(allInvoices.map(i => i.customerName))].sort();

    let filtered = [...allInvoices];
    let sort = { key: 'createdAt', order: 'desc' };
    let filters = { customer: 'all', period: 'month' }; // default to this month

    const applyInvoicesFilters = () => {
        filtered = allInvoices.filter(inv => {
            const matchesCustomer = filters.customer === 'all' || inv.customerName === filters.customer;

            const date = (inv.createdAt && inv.createdAt.toDate) ? inv.createdAt.toDate() : new Date(inv.createdAt);
            const now = new Date();
            let matchesPeriod = filters.period === 'all';
            if (filters.period === 'today') {
                matchesPeriod = date.getDate() === now.getDate() && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
            } else if (filters.period === 'week') {
                const startOfWeek = new Date(now);
                // Adjust to Monday as first day of week (common in Kyrgyzstan/Russia)
                startOfWeek.setDate(now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1));
                startOfWeek.setHours(0, 0, 0, 0);
                matchesPeriod = date >= startOfWeek;
            } else if (filters.period === 'month') {
                matchesPeriod = date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
            }

            return matchesCustomer && matchesPeriod;
        });

        // Apply Sort
        filtered.sort((a, b) => {
            if (a.isPrinted !== b.isPrinted) {
                return a.isPrinted ? 1 : -1;
            }

            let valA = a[sort.key];
            let valB = b[sort.key];

            if (sort.key === 'createdAt') {
                valA = valA ? (valA.toDate ? valA.toDate() : new Date(valA)) : new Date(0);
                valB = valB ? (valB.toDate ? valB.toDate() : new Date(valB)) : new Date(0);
            }

            if (valA < valB) return sort.order === 'asc' ? -1 : 1;
            if (valA > valB) return sort.order === 'asc' ? 1 : -1;
            return 0;
        });

        renderTable();
    };

    window.handleTableSort = (key) => {
        if (sort.key === key) {
            sort.order = sort.order === 'asc' ? 'desc' : 'asc';
        } else {
            sort.key = key;
            sort.order = 'asc';
        }
        applyInvoicesFilters();
    };

    const renderTable = () => {
        const table = new DataTable({
            columns: [
                { key: 'invoiceNumber', label: t('table_invoice_num'), render: (val) => `<span style="font-family: monospace; font-weight: 700; color: #1e3318;">${val}</span>` },
                {
                    key: 'customerName', label: 'Customer', render: (val, row) => `
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                        <span style="font-weight: 700; color: ${row.isPrinted ? '#10b981' : '#ef4444'};">${val}</span>
                        <div style="display: flex; gap: 4px; align-items: center;">
                            <button class="btn-icon" onclick="event.stopPropagation(); window.playClickAnimation(event, 'print'); window.viewInvoice('${row.id}')" title="Print Invoice" style="color: ${row.isPrinted ? '#10b981' : '#ef4444'}; background: transparent; padding: 2px;">
                                🖨️
                            </button>
                        </div>
                    </div>
                ` },
                { key: 'createdAt', label: 'Date', render: (val) => `<span style="color: #5a7052;">${formatDate((val && val.toDate) ? val.toDate() : val)}</span>` },
                { key: 'totalAmount', label: 'Amount', render: (val) => `<span style="font-weight: 700; color: #1e3318;">${formatCurrency(val || 0)}</span>` },
            ],
            data: filtered,
            sortKey: sort.key,
            sortOrder: sort.order,
            onRowClick: true,
            actions: (row) => `
                <div style="display: flex; gap: 4px;">
                    <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); window.playClickAnimation(event, 'print'); window.viewInvoice('${row.id}')">
                        ${t('btn_view') || 'View'}
                    </button>
                    <button class="btn btn-destructive btn-sm" style="padding: 4px 8px; font-size: 10px;" onclick="event.stopPropagation(); window.playClickAnimation(event, 'delete'); window.deleteInvoice('${row.id}')">
                        🗑️
                    </button>
                </div>
            `
        });

        container.innerHTML = `
            <div class="animate-fade-in" style="display: flex; flex-direction: column; gap: var(--space-4);">
                <div style="display: flex; justify-content: space-between; align-items: center; background: white; padding: 12px 16px; border-radius: var(--radius-lg); border: 1px solid var(--color-gray-200); gap: 12px;">
                    <div style="display: flex; gap: var(--space-4); align-items: center;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <label style="font-size: 12px; font-weight: 600; color: var(--color-gray-500);">Customer:</label>
                            <select id="filter-customer" style="padding: 4px 8px; border-radius: 6px; border: 1px solid var(--color-gray-200); font-size: 13px;">
                                <option value="all">${t('invoice_all_customers')}</option>
                                ${customers.map(c => `<option value="${c}" ${filters.customer === c ? 'selected' : ''}>${c}</option>`).join('')}
                            </select>
                        </div>
                        <div style="height: 20px; width: 1px; background: var(--color-gray-200);"></div>
                        <div style="display: flex; gap: 4px; background: var(--color-gray-50); padding: 4px; border-radius: 8px;">
                            <button class="period-btn btn btn-sm ${filters.period === 'today' ? 'btn-primary' : 'btn-ghost'}" data-period="today" style="font-size: 11px; padding: 4px 10px;">${t('invoice_today')}</button>
                            <button class="period-btn btn btn-sm ${filters.period === 'week' ? 'btn-primary' : 'btn-ghost'}" data-period="week" style="font-size: 11px; padding: 4px 10px;">${t('invoice_this_week')}</button>
                            <button class="period-btn btn btn-sm ${filters.period === 'month' ? 'btn-primary' : 'btn-ghost'}" data-period="month" style="font-size: 11px; padding: 4px 10px;">${t('invoice_this_month')}</button>
                            <button class="period-btn btn btn-sm ${filters.period === 'all' ? 'btn-primary' : 'btn-ghost'}" data-period="all" style="font-size: 11px; padding: 4px 10px;">${t('invoice_all_time')}</button>
                        </div>
                    </div>
                    ${googleSheetUrl ? `
                        <a href="${googleSheetUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm" style="white-space: nowrap; text-decoration: none;">
                            Open Google Sheet
                        </a>
                    ` : ''}
                </div>

                ${createCard({
            title: t('invoice_title'),
            content: table.render()
        })}
            </div>
        `;

        // Row Click Listeners
        container.querySelectorAll('.data-row').forEach(row => {
            row.addEventListener('click', () => {
                const id = row.dataset.id;
                router.navigate(ROUTES.INVOICE_DETAIL.replace(':id', id));
            });
        });



        // Process Post-Print Highlight Animation if redirected
        if (window.highlightOrderId) {
            setTimeout(() => {
                const highlightedInvoice = filtered.find(inv => inv.orderId === window.highlightOrderId);
                if (highlightedInvoice) {
                    const row = document.querySelector(`tr[data-id="${highlightedInvoice.id}"]`);
                    if (row) {
                        row.classList.add('row-success-anim');
                        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        // Remove class after animation finishes so it can re-trigger if needed
                        setTimeout(() => row.classList.remove('row-success-anim'), 3000); // 3s matches the CSS
                    }
                }
                // Clear the flag so it doesn't fire again on normal navigation
                delete window.highlightOrderId;
            }, 100); // small delay to ensure DOM paint attached
        }

        // Event Listeners for filters
        document.getElementById('filter-customer').addEventListener('change', (e) => {
            filters.customer = e.target.value;
            applyInvoicesFilters();
        });

        document.querySelectorAll('.period-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                filters.period = btn.dataset.period;
                applyInvoicesFilters();
            });
        });
    };

    // Initial Render
    applyInvoicesFilters();

    // Global Action Helper
    window.viewInvoice = (id) => router.navigate(ROUTES.INVOICE_DETAIL.replace(':id', id));

    window.toggleInvoicePrinted = async (orderId, isPrintedState) => {
        const { orderService } = await import("../services/orderService.js");
        if (orderId) {
            await orderService.updateOrder(orderId, { isPrinted: isPrintedState });
            renderInvoices();
        }
    };

    window.deleteInvoice = (id) => {
        import("../components/modal.js").then(({ Modal }) => {
            Modal.confirm(
                'Delete Invoice?',
                'This will permanently remove the invoice record. The associated order will remain. This action cannot be undone.',
                async () => {
                    const { invoiceService } = await import("../services/invoiceService.js");
                    await invoiceService.deleteInvoice(id);
                    renderInvoices(); // Refresh
                }
            );
        });
    };
};



export const renderInvoiceDetail = async ({ id }) => {
    layoutView.render();

    const container = document.getElementById('page-container');
    container.innerHTML = LoadingSkeleton();

    let invoice, allProducts, liveSettings;
    try {
        [invoice, allProducts, liveSettings] = await Promise.all([
            invoiceController.loadInvoice(id),
            productService.getAllProducts(),
            import("../services/settingsService.js").then(m => m.settingsService.getInvoiceSettings())
        ]);
    } catch (e) {
        console.error("error fetching invoice deps", e);
        container.innerHTML = `<div class="p-8 text-center" style="color: #ef4444; font-weight: 500;">An error occurred while loading this invoice.</div>`;
        return;
    }

    if (!invoice) {
        container.innerHTML = `<div class="p-8 text-center">Invoice not found</div>`;
        return;
    }

    invoice = await qrService.ensureInvoiceToken(invoice);

    const productMap = {};
    allProducts.forEach(p => {
        productMap[p.id] = p;
    });

    // (liveSettings fetched unconditionally to always overwrite visibility flags)

    let currentLang = 'ru';
    let currentPage = 1;
    let invoiceScale = 1.0;
    let is2UpMode = false;

    const ITEMS_PER_PAGE_FIRST = 10;
    const ITEMS_PER_PAGE_OTHER = 13;

    const renderDocument = (lang, isCopy = false) => {
        // Never let fallback defaults overwrite the saved invoice snapshot.
        const hasReliableLiveSettings = liveSettings && liveSettings.__fromFallback !== true;
        const s = hasReliableLiveSettings
            ? { ...(invoice.settings || {}), ...liveSettings }
            : { ...(invoice.settings || {}) };

        const defaultBankInfo = lang === 'en'
            ? "Bank of Kyrgyzstan,<br>Kyrgyzz Organics Ltd, KG12346712345789901<br>Account To: KG12346712345789901<br>SWIFT: KGZBBBBB"
            : (lang === 'kg' ? "Кыргызстан Банкы,<br>Кыргыз Органикс ЖЧКсы, KG12346712345789901<br>Эсеп: KG12346712345789901<br>SWIFT: KGZBBBBB" : "Банк Кыргызстана,<br>Kyrgyzz Organics Ltd, KG12346712345789901<br>Счет: KG12346712345789901<br>SWIFT: KGZBBBBB");

        const paymentTerms = lang === 'en'
            ? "Payment due within 30 days. Please transfer to account:"
            : (lang === 'kg' ? "Төлөм 30 күндүн ичинде. Сураныч, эсепке которуңуз:" : "Оплата в течение 30 дней. Перевод на счет:");

        const notesText = lang === 'en' ? (s.notesEn || paymentTerms) : (lang === 'kg' ? (s.notesKg || paymentTerms) : (s.notesRu || paymentTerms));
        const bannerFootText = s.footerText || t('print_thanks', lang);

        const items = invoice.items || [];
        const pages = [];

        // Chunk items
        let currentItemIndex = 0;
        while (currentItemIndex < items.length || pages.length === 0) {
            const isFirstPage = pages.length === 0;
            const limit = isFirstPage ? ITEMS_PER_PAGE_FIRST : ITEMS_PER_PAGE_OTHER;
            const pageItems = items.slice(currentItemIndex, currentItemIndex + limit);
            pages.push(pageItems);
            currentItemIndex += limit;
            if (currentItemIndex >= items.length) break;
        }

        const totalPages = pages.length;

        let calculatedSubtotal = 0;
        items.forEach(item => {
            const finalQty = item.adjustedQuantity !== undefined ? item.adjustedQuantity : item.quantity;
            calculatedSubtotal += (item.price || 0) * finalQty;
        });

        const subtotal = calculatedSubtotal;
        const taxRate = invoice.taxRate || 0;
        const taxAmount = (subtotal * taxRate) / 100;

        let discountAmount = invoice.discountAmount || 0;
        // recalculate discount if percent
        if (invoice.discountType === 'percent' && invoice.discountValue) {
            discountAmount = (subtotal * invoice.discountValue) / 100;
        }

        const grandTotal = subtotal + taxAmount - discountAmount;

        return pages.map((pageItems, index) => {
            const pageNum = index + 1;
            const isFirst = pageNum === 1;
            const isLast = pageNum === totalPages;

            return `
                <div class="invoice-page ${pageNum === currentPage ? 'active-page' : ''}" data-page="${pageNum}" style="
                    background: white; 
                    padding: 30px 40px; 
                    height: 296mm;
                    width: 210mm;
                    margin: 0 auto;
                    color: #1e3318;
                    font-family: 'Inter', -apple-system, sans-serif;
                    position: relative;
                    box-sizing: border-box;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                    display: ${pageNum === currentPage ? 'block' : 'none'};
                    transform: scale(${invoiceScale});
                    transform-origin: top center;
                    transition: transform 0.2s ease;
                    --zoom-scale: ${invoiceScale};
                    ${pageNum === currentPage ? '' : 'position: absolute; top: -10000px;'}
                ">
                    <!-- Header (Only on Page 1 or reduced on others) -->
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; gap: 40px;">
                        <div style="flex: 1;">
                             <div style="width: 180px; min-height: 40px;">
                                 ${s.logoUrl ? `<img src="${s.logoUrl}" style="max-width: 100%; height: auto; display: block;">` : '<div style="background: #ebf0e9; border-radius: 6px; padding: 10px; color: #5a7052; font-size: 10px;">LOGO</div>'}
                             </div>
                        </div>
                        <div style="text-align: right; flex: 1;">
                             <div style="display: inline-block; text-align: left;">
                             <div style="font-size: 14px; font-weight: 600; color: #1e3318; margin-bottom: 2px;">${t('print_invoice', lang)} #${invoice.invoiceNumber} ${isCopy ? '(Copy)' : ''}</div>
                                 <div style="font-size: 11px; color: #5a7052;">${t('print_date', lang)}: ${formatDate(invoice.createdAt)}</div>
                                 ${isFirst ? `<div style="font-size: 11px; color: #5a7052;">${t('table_phone', lang)}: ${s.phone || ''}</div>` : `<div style="font-size: 11px; color: #5a7052;">Page ${pageNum} / ${totalPages} ${isCopy ? '(Copy)' : ''}</div>`}
                             </div>
                        </div>
                    </div>

                    ${isFirst ? `
                    <h2 style="font-size: 20px; font-weight: 500; color: #2e4a23; margin: 0 0 10px 0; border-bottom: 2px solid #ebf0e9; padding-bottom: 4px; letter-spacing: -0.5px;">${t('print_invoice', lang)}</h2>

                    <div style="display: flex; justify-content: space-between; margin-bottom: 15px; gap: 20px;">
                        <div style="flex: 1.2;">
                            <div style="font-weight: 700; color: #5a7052; text-transform: uppercase; font-size: 9px; letter-spacing: 1px; margin-bottom: 6px;">${t('print_bill_to', lang)}</div>
                            <div style="font-size: 15px; font-weight: 700; color: #1e3318; margin-bottom: 4px;">${invoice.customerName}</div>
                            <div style="color: #435a3c; line-height: 1.5; font-size: 12px; max-width: 300px;">
                                 ${invoice.customerAddress || 'Republic of Kyrgyzstan'}
                            </div>
                        </div>
                        <div style="text-align: right; flex: 0.8;">
                             <div style="background: #ffffff; padding: 15px; border-radius: 8px; border: 1px solid #d8e2d4; display: inline-block; min-width: 200px; text-align: left; box-shadow: 0 2px 8px rgba(0,0,0,0.02);">
                                <div style="font-size: 8px; color: #5a7052; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px;">${t('print_date', lang).toUpperCase()}:</div>
                                <div style="font-size: 13px; color: #1e3318; margin-bottom: 8px; font-weight: 500;">${formatDate(invoice.createdAt)}</div>
                                <div style="font-size: 8px; color: #5a7052; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0;">TOTAL DUE:</div>
                                <div style="font-size: 22px; font-weight: 800; color: #1e3318; letter-spacing: -1px;">${formatCurrency(grandTotal).replace('$', '')} <span style="font-size: 11px; font-weight: 400; color: #5a7052;">SOM</span></div>
                             </div>
                        </div>
                    </div>
                    ` : ''}

                    <!-- Product Table -->
                    <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px; border-top: 1px solid #e2e8e0;">
                        <tbody style="font-size: 12px;">
                            ${pageItems.map((item, idx) => {
                const liveProduct = productMap[item.productId];
                let itemName = item.name;

                if (lang === 'ru') {
                    itemName = item.name_ru || (liveProduct && liveProduct.name_ru) || item.name_en || (liveProduct && liveProduct.name_en) || item.name;
                } else if (lang === 'kg') {
                    itemName = item.name_kg || (liveProduct && liveProduct.name_kg) || item.name_en || (liveProduct && liveProduct.name_en) || item.name;
                } else {
                    itemName = item.name_en || (liveProduct && liveProduct.name_en) || item.name;
                }

                const finalQty = item.adjustedQuantity !== undefined ? item.adjustedQuantity : item.quantity;

                return `
                                    <tr style="background: ${idx % 2 === 0 ? '#fafaf8' : '#fff'}; border-bottom: 1px solid #e2e8e0;">
                                        <td style="padding: 6px 10px;">
                                        <div style="font-weight: 600; color: #1e3318;">${itemName}</div>
                                            ${item.weight ? `<div style="font-size: 9px; color: #5a7052; margin-top: 1px;">${item.weight}</div>` : ''}
                                        </td>
                                        <td style="padding: 6px 10px; text-align: center; color: #1e3318;">${finalQty}</td>
                                        <td style="padding: 6px 10px; text-align: right; color: #1e3318;">${formatCurrency(item.price)}</td>
                                        <td style="padding: 6px 10px; text-align: right; font-weight: 700; color: #1e3318;">${formatCurrency(item.price * finalQty)}</td>
                                    </tr>
                                `;
            }).join('')}
                        </tbody>
                    </table>

                    ${isLast ? `
                    <!-- Summary Section -->
                    <div style="display: flex; justify-content: flex-end; margin-bottom: 25px; page-break-inside: avoid;">
                        <div style="width: 280px;">
                            <div style="display: flex; justify-content: space-between; padding: 6px 12px; border-bottom: 1px solid #e2e8e0;">
                                <span style="color: #5a7052; font-size: 11px; font-weight: 500;">${t('print_subtotal', lang)}</span>
                                <span style="font-weight: 600; color: #1e3318; font-size: 11px;">${formatCurrency(subtotal)}</span>
                            </div>
                            ${taxAmount > 0 ? `
                            <div style="display: flex; justify-content: space-between; padding: 6px 12px; border-bottom: 1px solid #e2e8e0;">
                                <span style="color: #5a7052; font-size: 11px; font-weight: 500;">${t('print_vat', lang)} (${taxRate}%)</span>
                                <span style="font-weight: 600; color: #1e3318; font-size: 11px;">${formatCurrency(taxAmount)}</span>
                            </div>` : ''}
                            <div style="margin-top: 10px; background: #2e4a23; color: #fff; padding: 12px; border-radius: 4px; display: flex; justify-content: space-between; align-items: baseline;">
                                <span style="font-size: 10px; font-weight: 700; text-transform: uppercase;">${t('print_grand_total', lang)}</span>
                                <span style="font-size: 20px; font-weight: 800;">${formatCurrency(grandTotal)}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Footer -->
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 30px; border-top: 1px solid #e2e8e0; padding-top: 15px; margin-bottom: 20px; page-break-inside: avoid;">
                        <div style="flex: 1;">
                            ${(s.showNotes !== false) ? `
                            <div style="font-weight: 700; color: #5a7052; text-transform: uppercase; font-size: 9px; margin-bottom: 8px;">${t('print_notes', lang)}</div>
                            <div style="font-size: 11px; color: #5a7052; line-height: 1.5;">
                                <div style="margin-bottom: 2px;">${notesText}</div>
                                <div style="font-weight: 500; font-family: monospace; background: #fafbf9; padding: 12px; border: 1px solid #ebf0e9; border-radius: 6px; font-size: 10px; line-height: 1.6;">
                                    ${(s.bankInfo || defaultBankInfo).split('\n').map(line => `<div style="margin-bottom: 2px;">• ${line.trim()}</div>`).join('')}
                                </div>
                            </div>
                            ` : ''}
                        </div>
                        ${(s.showQrCode !== false) ? `
                        <div style="display: flex; gap: 12px; text-align: center;">
                            <div>
                                <div style="display: inline-block; padding: 6px; background: #fff; border: 2px solid #2e4a23; border-radius: 8px; margin-bottom: 4px;">
                                    <img src="${qrService.buildQrImageUrl(invoice, 120, 'customer')}" alt="Customer Invoice QR" style="width: 58px; height: 58px; display: block;">
                                </div>
                                <div style="font-size: 8px; font-weight: 800; color: #2e4a23; text-transform: uppercase;">Customer QR</div>
                                <div style="font-size: 7px; color: #5a7052;">Return or re-order</div>
                            </div>
                            <div>
                                <div style="display: inline-block; padding: 6px; background: #fff; border: 2px solid #b45309; border-radius: 8px; margin-bottom: 4px;">
                                    <img src="${qrService.buildQrImageUrl(invoice, 120, 'courier')}" alt="Courier Invoice QR" style="width: 58px; height: 58px; display: block;">
                                </div>
                                <div style="font-size: 8px; font-weight: 800; color: #92400e; text-transform: uppercase;">Courier QR</div>
                                <div style="font-size: 7px; color: #5a7052;">Save returns</div>
                            </div>
                        </div>
                        ` : ''}
                    </div>
                    ` : ''}

                    <!-- Banner Foot -->
                    ${(s.showFooter !== false) ? `
                    <div style="position: absolute; bottom: 20px; left: 0; right: 0; padding: 12px; text-align: center; color: #5a7052; font-size: 10px;">
                        — ${bannerFootText} —
                    </div>
                    ` : ''}
                </div>
            `;
        });
    };

    const refreshBody = () => {

        const items = invoice.items || [];
        const totalPages = Math.ceil((items.length - ITEMS_PER_PAGE_FIRST) / ITEMS_PER_PAGE_OTHER) + 1;
        const realTotalPages = items.length <= ITEMS_PER_PAGE_FIRST ? 1 : totalPages;

        let finalHtml = '';

        if (is2UpMode) {
            // Render BOTH versions (Original and Copy) for interleaving
            const originalPages = renderDocument(currentLang, false);
            const copyPages = renderDocument(currentLang, true);

            originalPages.forEach((page, i) => {
                finalHtml += `
                    <div class="print-sheet">
                        <div class="sheet-half">${page}</div>
                        <div class="sheet-half">${copyPages[i] || ''}</div>
                    </div>
                `;
            });
        } else {
            const renderedPages = renderDocument(currentLang);
            finalHtml = renderedPages.join('');
        }

        container.innerHTML = `
            <div style="display: flex; gap: 15px; justify-content: center; padding: 15px; border-bottom: 1px solid var(--color-gray-200); background: #f7fafc; position: sticky; top: 0; z-index: 100;">
                <button id="lang-en" class="btn ${currentLang === 'en' ? 'btn-primary' : 'btn-secondary'} btn-sm">🇬🇧 EN</button>
                <button id="lang-ru" class="btn ${currentLang === 'ru' ? 'btn-primary' : 'btn-secondary'} btn-sm">🇷🇺 RU</button>
                
                <div style="display: flex; align-items: center; gap: 8px; border-left: 1px solid var(--color-gray-200); padding-left: 15px;">
                    <span style="font-size: 12px; font-weight: 600;">Date:</span>
                    <input type="date" id="invoice-date-picker" class="input" style="padding: 2px 8px; height: 32px; font-size: 13px; width: 140px;" 
                           value="${((invoice.createdAt && invoice.createdAt.toDate) ? invoice.createdAt.toDate() : new Date(invoice.createdAt)).toISOString().split('T')[0]}">
                </div>

                <div style="flex: 1; display: flex; justify-content: center; align-items: center; gap: 15px;">
                    <button id="prev-page" class="btn btn-secondary btn-sm" ${currentPage === 1 ? 'disabled' : ''}>← Prev</button>
                    <span style="font-weight: 600; font-size: 14px; min-width: 80px; text-align: center;">Page ${currentPage} / ${realTotalPages}</span>
                    <button id="next-page" class="btn btn-secondary btn-sm" ${currentPage === realTotalPages ? 'disabled' : ''}>Next →</button>
                </div>

                <div style="display: flex; align-items: center; gap: 8px; border-left: 1px solid var(--color-gray-200); padding-left: 15px;">
                    <span style="font-size: 12px; font-weight: 600;">Zoom:</span>
                    <input type="range" id="zoom-slider" min="0.4" max="1.5" step="0.05" value="${invoiceScale}" style="width: 100px;">
                    <span style="font-size: 11px; width: 35px;">${Math.round(invoiceScale * 100)}%</span>
                </div>

                <div style="display: flex; gap: 8px; border-left: 1px solid var(--color-gray-200); padding-left: 15px;">
                    <button id="btn-copy-qr" class="btn btn-secondary btn-sm">QR Link</button>
                    <button id="btn-return-items" class="btn btn-secondary btn-sm">Return Items</button>
                    <button id="btn-complete-invoice" class="btn btn-primary btn-sm">Complete</button>
                    <button id="btn-print-portrait" class="btn btn-primary btn-sm">🖨️ Portrait</button>
                    <button id="btn-print-landscape" class="btn btn-secondary btn-sm" title="2 Invoices stacked on Portrait A4">📄 2-up Portrait</button>
                </div>
            </div>
            
            <div id="invoice-doc-container" class="animate-fade-in ${is2UpMode ? 'printing-2up-portrait' : ''}" style="background: var(--color-gray-100); padding: 40px 0; overflow: auto; height: calc(100vh - 150px); display: flex; flex-direction: column; align-items: center; width: 100%;">
                <div class="print-wrapper" style="display: flex; flex-direction: column; align-items: center; width: 100%;">
                    ${finalHtml}
                </div>
            </div>

            <style>
                #invoice-doc-container::-webkit-scrollbar { display: none; }
                
                @media screen {
                    .invoice-page {
                        display: none;
                    }
                    .invoice-page.active-page {
                        display: block;
                    }

                    /* Small screen preview adjustment */
                    #invoice-doc-container.printing-2up-portrait .invoice-page {
                        display: block !important;
                        position: static !important;
                        box-sizing: border-box !important;
                        width: 210mm !important;
                        height: 297mm !important;
                        min-height: 297mm !important;
                        max-height: 297mm !important;
                        margin: -74.25mm 0 0 0 !important;
                        transform-origin: center center !important;
                        transform: rotate(-90deg) scale(0.68) !important;
                        opacity: 1;
                        padding: 15mm 20mm !important;
                        overflow: hidden !important;
                    }
                    
                    #invoice-doc-container.printing-2up-portrait .print-sheet {
                        display: block !important;
                        width: 210mm;
                        height: 297mm;
                        background: white;
                        margin: 0 auto 40px auto;
                        box-shadow: 0 10px 30px rgba(0,0,0,0.1);
                        position: relative;
                        font-size: 0;
                        box-sizing: border-box;
                    }

                    #invoice-doc-container.printing-2up-portrait .sheet-half {
                        width: 210mm;
                        height: 148.5mm;
                        position: relative;
                        border-bottom: 1px dashed #e2e8e0;
                        box-sizing: border-box;
                        overflow: hidden;
                    }
                }

                @media print {
                    @page { 
                        margin: 0; 
                        size: A4 portrait; 
                    }
                    
                    /* Force background colors and images */
                    * { 
                        -webkit-print-color-adjust: exact !important; 
                        print-color-adjust: exact !important; 
                        color-adjust: exact !important;
                    }
                    
                    /* Reset global layout constraints */
                    html, body { 
                        margin: 0 !important; 
                        padding: 0 !important; 
                        height: auto !important; 
                        overflow: visible !important; 
                        background: white !important;
                    }
                    
                    #app, 
                    .main-content, 
                    .page-container,
                    #invoice-doc-container {
                        display: block !important;
                        height: auto !important;
                        width: 100% !important;
                        min-width: 0 !important;
                        overflow: visible !important;
                        position: static !important;
                        padding: 0 !important;
                        margin: 0 !important;
                        transform: none !important;
                        border: none !important;
                        box-shadow: none !important;
                    }

                    /* Hide all UI elements */
                    header, nav, #sidebar, #top-bar, .btn, .loading-screen, #toast-container, #modal-container,
                    div[style*="position: sticky"], div[style*="z-index: 100"], .period-btn, #zoom-slider, input[type="range"] { 
                        display: none !important; 
                    }
                    
                    ::-webkit-scrollbar { display: none !important; }

                    /* Portrait standard page */
                    .invoice-page {
                        display: block !important;
                        visibility: visible !important;
                        opacity: 1 !important;
                        position: relative !important;
                        top: 0 !important;
                        left: 0 !important;
                        margin: 0 auto !important;
                        padding: 10mm 15mm !important; 
                        width: 210mm !important;
                        height: 296mm !important; 
                        min-height: 296mm !important;
                        box-sizing: border-box !important;
                        page-break-after: always !important;
                        page-break-inside: avoid !important;
                        transform: none !important;
                        box-shadow: none !important;
                        background: white !important;
                    }

                    #invoice-doc-container > .print-wrapper > .invoice-page:last-of-type,
                    .invoice-page:last-child {
                        page-break-after: avoid !important;
                    }

                    /* Portrait 2-up (Sideways Stack) */
                    .print-sheet {
                        display: block !important;
                        position: relative !important;
                        width: 210mm !important;
                        height: 297mm !important; 
                        page-break-after: always !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        background: white !important;
                        font-size: 0 !important;
                        overflow: hidden !important;
                        box-sizing: border-box !important;
                    }

                    #invoice-doc-container > .print-wrapper > .print-sheet:last-of-type {
                        page-break-after: avoid !important;
                    }

                    .sheet-half {
                        width: 210mm !important;
                        height: 148.5mm !important;
                        position: relative !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        display: block !important;
                        overflow: hidden !important;
                        box-sizing: border-box !important;
                        border-bottom: 1px dashed #f0f0f0 !important;
                    }

                    body.printing-2up-portrait .invoice-page {
                        display: block !important;
                        position: static !important;
                        box-sizing: border-box !important;
                        width: 210mm !important;
                        height: 297mm !important;
                        min-height: 297mm !important;
                        max-height: 297mm !important;
                        margin: -74.25mm 0 0 0 !important;
                        transform-origin: center center !important;
                        transform: rotate(-90deg) scale(0.68) !important;
                        padding: 15mm 20mm !important;
                        page-break-after: auto !important;
                        background: white !important;
                        visibility: visible !important;
                        box-shadow: none !important;
                        border: none !important;
                        overflow: hidden !important;
                    }

                    .invoice-page * {
                        overflow: visible !important;
                    }
                }
            </style>
        `;

        try {
            // Event Listeners
            document.getElementById('lang-en').addEventListener('click', () => { currentLang = 'en'; refreshBody(); });
            document.getElementById('lang-ru').addEventListener('click', () => { currentLang = 'ru'; refreshBody(); });

            document.getElementById('invoice-date-picker').addEventListener('change', async (e) => {
                const newDate = e.target.value;
                const success = await invoiceController.updateDate(id, newDate);
                if (success) {
                    // Update local model
                    const d = new Date(newDate + 'T12:00:00');
                    invoice.createdAt = d;
                    invoice.dueDate = d;
                    refreshBody();
                }
            });

            document.getElementById('prev-page').addEventListener('click', () => { if (currentPage > 1) { currentPage--; refreshBody(); } });
            document.getElementById('next-page').addEventListener('click', () => { if (currentPage < realTotalPages) { currentPage++; refreshBody(); } });

            document.getElementById('zoom-slider').addEventListener('input', (e) => {
                invoiceScale = parseFloat(e.target.value);
                const activePage = container.querySelector('.invoice-page.active-page');
                if (activePage) activePage.style.transform = `scale(${invoiceScale})`;
                e.target.nextElementSibling.textContent = `${Math.round(invoiceScale * 100)}%`;
            });

            document.getElementById('btn-copy-qr').addEventListener('click', async () => {
                const qrLink = qrService.buildMobileUrl(invoice, 'customer');
                if (navigator.clipboard) {
                    await navigator.clipboard.writeText(qrLink);
                } else {
                    prompt('Copy QR invoice link:', qrLink);
                }
                const { notificationService } = await import("../core/notificationService.js");
                notificationService.success('QR invoice link copied.');
            });

            document.getElementById('btn-return-items').addEventListener('click', async () => {
                const { Modal } = await import("../components/modal.js");
                const returnItemsByProduct = {};
                (invoice.returnItems || []).forEach(item => { returnItemsByProduct[item.productId] = item.quantity; });
                const modal = new Modal({
                    title: 'Return Items',
                    size: 'large',
                    confirmText: 'Save Return',
                    content: `
                        <div style="display: flex; flex-direction: column; gap: 10px;">
                            ${(invoice.items || []).map(item => {
                                const productId = item.productId || item.name;
                                const itemName = item.name || item.productName || productMap[item.productId]?.displayName || 'Product';
                                const quantity = item.adjustedQuantity !== undefined ? item.adjustedQuantity : item.quantity;
                                return `
                                    <label style="display: grid; grid-template-columns: 1fr 100px; gap: 12px; align-items: center; padding: 10px; border: 1px solid var(--color-gray-200); border-radius: 10px;">
                                        <span style="font-weight: 700;">${itemName}<small style="display:block; color: var(--color-gray-500); font-weight: 500;">Ordered: ${quantity || 0}</small></span>
                                        <input class="return-qty-input input" type="number" min="0" max="${quantity || 0}" value="${returnItemsByProduct[productId] || 0}" data-product-id="${productId}">
                                    </label>
                                `;
                            }).join('')}
                        </div>
                    `,
                    onConfirm: async () => {
                        const returnItems = [...document.querySelectorAll('.return-qty-input')].map(input => ({
                            productId: input.dataset.productId,
                            quantity: Number(input.value) || 0
                        }));
                        const { returnsService } = await import("../services/returnsService.js");
                        await returnsService.requestReturn(invoice.id, returnItems);
                        const { notificationService } = await import("../core/notificationService.js");
                        notificationService.success('Return request saved.');
                        renderInvoiceDetail({ id });
                    }
                });
                modal.open();
            });

            document.getElementById('btn-complete-invoice').addEventListener('click', async () => {
                const { returnsService } = await import("../services/returnsService.js");
                const { notificationService } = await import("../core/notificationService.js");
                await returnsService.markCompleted(invoice.id);
                notificationService.success('Invoice completed.');
                renderInvoiceDetail({ id });
            });

            const handlePrintSuccess = async () => {
                // Slight delay so the UI can settle back to normal before the modal pops
                setTimeout(async () => {
                    const { Modal } = await import("../components/modal.js");
                    const modal = new Modal({
                        title: t('modal_print_title'),
                        content: `<p style="font-size: 14px; margin-bottom: 20px; color: var(--color-gray-700);">${t('modal_print_body')}</p>`,
                        confirmText: t('btn_mark_printed'),
                        cancelText: t('btn_skip'),
                        type: 'primary',
                        onConfirm: async () => {
                            try {
                                try {
                                    const { orderService } = await import("../services/orderService.js");
                                    const { gamificationService } = await import("../services/gamificationService.js");
                                    const order = await orderService.getOrderById(invoice.orderId);
                                    await orderService.updateOrder(invoice.orderId, { isPrinted: true });
                                    if (!order?.isPrinted) {
                                        await gamificationService.awardAction('invoicesPrinted');
                                    }
                                } catch (updateErr) {
                                    console.warn("Could not sync print status to order (order may have been deleted):", updateErr);
                                    // We continue anyway so the user isn't stuck and the animation still plays
                                }

                                // 1. Set global flag for the animation
                                window.highlightOrderId = invoice.orderId;

                                // 2. Redirect to Orders tab (Dashboard)
                                router.navigate(ROUTES.DASHBOARD);

                                const { notificationService } = await import("../core/notificationService.js");
                                notificationService.success(t('msg_invoice_printed'));
                            } catch (e) {
                                console.error("Failed post-print routine", e);
                            }
                        }
                    });
                    modal.open();
                }, 500);
            };

            document.getElementById('btn-print-portrait').addEventListener('click', () => {
                document.body.classList.remove('printing-2up-portrait');
                window.print();
                handlePrintSuccess();
            });

            document.getElementById('btn-print-landscape').addEventListener('click', () => {
                is2UpMode = true;
                refreshBody(); // Render duplicate pages in DOM

                document.body.classList.add('printing-2up-portrait');
                window.print();

                // Revert to normal view
                setTimeout(() => {
                    document.body.classList.remove('printing-2up-portrait');
                    is2UpMode = false;
                    refreshBody();
                    handlePrintSuccess();
                }, 1000);
            });
        } catch (e) {
            console.error("error attaching listener in refreshBody", e);
        }
    };

    try {
        refreshBody();
    } catch (err) {
        console.error("render invoice detail fail", err);
        container.innerHTML = `<div class="p-8 text-center" style="color: #ef4444; font-weight: 500;">Failed to render invoice. Some data may be missing or corrupt (possibly offline).</div>`;
    }
};

