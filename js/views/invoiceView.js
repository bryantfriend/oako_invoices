import { layoutView } from "./layoutView.js";
import { invoiceController } from "../controllers/invoiceController.js";
import { LoadingSkeleton } from "../components/loadingSkeleton.js";
import { formatDate, formatCurrency } from "../core/formatters.js";
import { createCard } from "../components/card.js";
import { createStatusBadge } from "../components/statusBadge.js";
import { DataTable } from "../components/dataTable.js";

import { router } from "../router.js";
import { ROUTES } from "../core/constants.js";
import { productService } from "../services/productService.js";

export const renderInvoices = async () => {
    layoutView.render();
    layoutView.updateTitle("Invoices");
    const container = document.getElementById('page-container');
    container.innerHTML = LoadingSkeleton();

    // Load Data
    const allInvoices = await invoiceController.loadAllInvoices();
    const customers = [...new Set(allInvoices.map(i => i.customerName))].sort();

    let filtered = [...allInvoices];
    let sort = { key: 'createdAt', order: 'desc' };
    let filters = { customer: 'all', period: 'month' }; // default to this month

    const applyInvoicesFilters = () => {
        filtered = allInvoices.filter(inv => {
            const matchesCustomer = filters.customer === 'all' || inv.customerName === filters.customer;

            const date = inv.createdAt?.toDate ? inv.createdAt.toDate() : new Date(inv.createdAt);
            const now = new Date();
            const matchesPeriod = filters.period === 'all' || (
                date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear()
            );

            return matchesCustomer && matchesPeriod;
        });

        // Apply Sort
        filtered.sort((a, b) => {
            let valA = a[sort.key];
            let valB = b[sort.key];

            if (sort.key === 'createdAt') {
                valA = valA?.toDate ? valA.toDate() : new Date(valA);
                valB = valB?.toDate ? valB.toDate() : new Date(valB);
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
                { key: 'invoiceNumber', label: 'Invoice #', render: (val) => `<span style="font-family: monospace; font-weight: 700; color: #1e3318;">${val}</span>` },
                { key: 'customerName', label: 'Customer', render: (val) => `<span style="color: #1e3318; font-weight: 500;">${val}</span>` },
                { key: 'createdAt', label: 'Date', render: (val) => `<span style="color: #5a7052;">${formatDate(val?.toDate ? val.toDate() : val)}</span>` },
                { key: 'totalAmount', label: 'Amount', render: (val) => `<span style="font-weight: 700; color: #1e3318;">${formatCurrency(val || 0)}</span>` },
            ],
            data: filtered,
            sortKey: sort.key,
            sortOrder: sort.order,
            onRowClick: true,
            actions: (row) => `
                <div style="display: flex; gap: 4px;">
                    <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); window.viewInvoice('${row.id}')">
                        View
                    </button>
                    <button class="btn btn-destructive btn-sm" style="padding: 4px 8px; font-size: 10px;" onclick="event.stopPropagation(); window.deleteInvoice('${row.id}')">
                        🗑️
                    </button>
                </div>
            `
        });

        container.innerHTML = `
            <div class="animate-fade-in" style="display: flex; flex-direction: column; gap: var(--space-4);">
                <div style="display: flex; justify-content: space-between; align-items: center; background: white; padding: 12px 16px; border-radius: var(--radius-lg); border: 1px solid var(--color-gray-200);">
                    <div style="display: flex; gap: var(--space-4); align-items: center;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <label style="font-size: 12px; font-weight: 600; color: var(--color-gray-500);">Customer:</label>
                            <select id="filter-customer" style="padding: 4px 8px; border-radius: 6px; border: 1px solid var(--color-gray-200); font-size: 13px;">
                                <option value="all">All Customers</option>
                                ${customers.map(c => `<option value="${c}" ${filters.customer === c ? 'selected' : ''}>${c}</option>`).join('')}
                            </select>
                        </div>
                        <div style="height: 20px; width: 1px; background: var(--color-gray-200);"></div>
                        <div style="display: flex; gap: 4px; background: var(--color-gray-50); padding: 4px; border-radius: 8px;">
                            <button class="period-btn btn btn-sm ${filters.period === 'month' ? 'btn-primary' : 'btn-ghost'}" data-period="month" style="font-size: 11px; padding: 4px 10px;">This Month</button>
                            <button class="period-btn btn btn-sm ${filters.period === 'all' ? 'btn-primary' : 'btn-ghost'}" data-period="all" style="font-size: 11px; padding: 4px 10px;">All Time</button>
                        </div>
                    </div>
                </div>

                ${createCard({
            title: 'Invoices',
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

    window.deleteInvoice = (id) => {
        const { Modal } = import("../components/modal.js").then(({ Modal }) => {
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

const INVOICE_I18N = {
    en: {
        invoice: "Invoice",
        invoiceNumber: "Invoice number",
        date: "Date",
        billTo: "Bill to:",
        description: "Description",
        quantity: "Quantity",
        unitPrice: "Unit Price",
        total: "Total",
        subtotal: "Subtotal",
        vat: "VAT",
        discount: "Discount",
        grandTotal: "Grand Total",
        notes: "Notes:",
        paymentTerms: "Payment due within 30 days. Please transfer to account:",
        bankInfo: "Bank of Kyrgyzstan,<br>Kyrgyzz Organics Ltd, KG12346712345789901<br>Account To: KG12346712345789901<br>SWIFT: KGZBBBBB",
        thanks: "Thanks for supporting sustainable agriculture!",
        phone: "Phone",
        website: "kyrgyz-organics.com"
    },
    ru: {
        invoice: "Счёт-фактура",
        invoiceNumber: "Номер счёта",
        date: "Дата",
        billTo: "Получатель:",
        description: "Описание",
        quantity: "Кол-во",
        unitPrice: "Цена",
        total: "Итого",
        subtotal: "Подытог",
        vat: "НДС",
        discount: "Скидка",
        grandTotal: "Общая сумма",
        notes: "Заметки:",
        paymentTerms: "Оплата в течение 30 дней. Перевод на счет:",
        bankInfo: "Банк Кыргызстана,<br>Kyrgyzz Organics Ltd, KG12346712345789901<br>Счет: KG12346712345789901<br>SWIFT: KGZBBBBB",
        thanks: "Спасибо за поддержку экологичного фермерства!",
        phone: "Тел",
        website: "kyrgyz-organics.ru"
    }
};

export const renderInvoiceDetail = async ({ id }) => {
    layoutView.render();

    const container = document.getElementById('page-container');
    container.innerHTML = LoadingSkeleton();

    const [invoice, allProducts] = await Promise.all([
        invoiceController.loadInvoice(id),
        productService.getAllProducts()
    ]);

    if (!invoice) {
        container.innerHTML = `<div class="p-8 text-center">Invoice not found</div>`;
        return;
    }

    const productMap = {};
    allProducts.forEach(p => {
        productMap[p.id] = p;
    });

    // FALLBACK: If invoice has no snapshotted logo, get current global logo
    let liveSettings = null;
    if (!invoice.settings?.logoUrl) {
        const { settingsService } = await import("../services/settingsService.js");
        liveSettings = await settingsService.getInvoiceSettings();
    }

    let currentLang = 'en';
    let currentPage = 1;
    let invoiceScale = 1.0;
    let is2UpMode = false;

    const ITEMS_PER_PAGE_FIRST = 10;
    const ITEMS_PER_PAGE_OTHER = 15;

    const renderDocument = (lang, isCopy = false) => {
        const t = INVOICE_I18N[lang];
        const s = invoice.settings || liveSettings || {};
        if (!s.logoUrl && liveSettings?.logoUrl) s.logoUrl = liveSettings.logoUrl;

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

        const subtotal = invoice.subtotal || 0;
        const taxRate = invoice.taxRate || 0;
        const taxAmount = invoice.taxAmount || 0;
        const discountAmount = invoice.discountAmount || 0;
        const grandTotal = invoice.totalAmount || 0;

        return pages.map((pageItems, index) => {
            const pageNum = index + 1;
            const isFirst = pageNum === 1;
            const isLast = pageNum === totalPages;

            return `
                <div class="invoice-page ${pageNum === currentPage ? 'active-page' : ''}" data-page="${pageNum}" style="
                    background: white; 
                    padding: 40px; 
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
                    ${pageNum === currentPage ? '' : 'position: absolute; top: -10000px;'}
                ">
                    <!-- Header (Only on Page 1 or reduced on others) -->
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; gap: 40px;">
                        <div style="flex: 1;">
                             <div style="width: 180px; min-height: 40px;">
                                 ${s.logoUrl ? `<img src="${s.logoUrl}" style="max-width: 100%; height: auto; display: block;">` : '<div style="background: #ebf0e9; border-radius: 6px; padding: 10px; color: #5a7052; font-size: 10px;">LOGO</div>'}
                             </div>
                        </div>
                        <div style="text-align: right; flex: 1;">
                             <div style="display: inline-block; text-align: left;">
                             <div style="font-size: 14px; font-weight: 600; color: #1e3318; margin-bottom: 2px;">${t.invoice} #${invoice.invoiceNumber} ${isCopy ? '(Copy)' : ''}</div>
                                 <div style="font-size: 11px; color: #5a7052;">${t.date}: ${formatDate(invoice.createdAt)}</div>
                                 ${isFirst ? `<div style="font-size: 11px; color: #5a7052;">${t.phone}: ${s.phone || ''}</div>` : `<div style="font-size: 11px; color: #5a7052;">Page ${pageNum} / ${totalPages} ${isCopy ? '(Copy)' : ''}</div>`}
                             </div>
                        </div>
                    </div>

                    ${isFirst ? `
                    <h2 style="font-size: 20px; font-weight: 500; color: #2e4a23; margin: 0 0 15px 0; border-bottom: 2px solid #ebf0e9; padding-bottom: 4px; letter-spacing: -0.5px;">${t.invoice}</h2>

                    <div style="display: flex; justify-content: space-between; margin-bottom: 20px; gap: 20px;">
                        <div style="flex: 1.2;">
                            <div style="font-weight: 700; color: #5a7052; text-transform: uppercase; font-size: 9px; letter-spacing: 1px; margin-bottom: 6px;">${t.billTo}</div>
                            <div style="font-size: 15px; font-weight: 700; color: #1e3318; margin-bottom: 4px;">${invoice.customerName}</div>
                            <div style="color: #435a3c; line-height: 1.5; font-size: 12px; max-width: 300px;">
                                 ${invoice.customerAddress || 'Republic of Kyrgyzstan'}
                            </div>
                        </div>
                        <div style="text-align: right; flex: 0.8;">
                             <div style="background: #ffffff; padding: 15px; border-radius: 8px; border: 1px solid #d8e2d4; display: inline-block; min-width: 200px; text-align: left; box-shadow: 0 2px 8px rgba(0,0,0,0.02);">
                                <div style="font-size: 8px; color: #5a7052; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px;">DATE:</div>
                                <div style="font-size: 13px; color: #1e3318; margin-bottom: 8px; font-weight: 500;">${formatDate(invoice.createdAt)}</div>
                                <div style="font-size: 8px; color: #5a7052; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0;">TOTAL DUE:</div>
                                <div style="font-size: 22px; font-weight: 800; color: #1e3318; letter-spacing: -1px;">${formatCurrency(grandTotal).replace('$', '')} <span style="font-size: 11px; font-weight: 400; color: #5a7052;">SOM</span></div>
                             </div>
                        </div>
                    </div>
                    ` : ''}

                    <!-- Product Table -->
                    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                        <thead>
                            <tr style="background: #2e4a23; color: #fff;">
                                <th style="padding: 8px 12px; text-align: left; border-radius: 4px 0 0 0; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px;">${t.description}</th>
                                <th style="padding: 8px 12px; text-align: center; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px;">${t.quantity}</th>
                                <th style="padding: 8px 12px; text-align: right; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px;">${t.unitPrice}</th>
                                <th style="padding: 8px 12px; text-align: right; border-radius: 0 4px 0 0; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px;">${t.total}</th>
                            </tr>
                        </thead>
                        <tbody style="font-size: 12px;">
                            ${pageItems.map((item, idx) => {
                // 1. Try Snapshot (Localized)
                // 2. Try Live Catalog Fallback (Localized)
                // 3. Try Snapshot (Generic Name)
                const liveProduct = productMap[item.productId];
                let itemName = item.name;

                if (lang === 'ru') {
                    itemName = item.name_ru || liveProduct?.name_ru || item.name_en || liveProduct?.name_en || item.name;
                } else {
                    itemName = item.name_en || liveProduct?.name_en || item.name;
                }

                return `
                                    <tr style="background: ${idx % 2 === 0 ? '#fafaf8' : '#fff'}; border-bottom: 1px solid #e2e8e0;">
                                        <td style="padding: 8px 12px;">
                                        <div style="font-weight: 600; color: #1e3318;">${itemName}</div>
                                            ${item.weight ? `<div style="font-size: 9px; color: #5a7052; margin-top: 1px;">${item.weight}</div>` : ''}
                                        </td>
                                        <td style="padding: 8px 12px; text-align: center; color: #1e3318;">${item.quantity}</td>
                                        <td style="padding: 8px 12px; text-align: right; color: #1e3318;">${formatCurrency(item.price)}</td>
                                        <td style="padding: 8px 12px; text-align: right; font-weight: 700; color: #1e3318;">${formatCurrency(item.price * item.quantity)}</td>
                                    </tr>
                                `;
            }).join('')}
                        </tbody>
                    </table>

                    ${isLast ? `
                    <!-- Summary Section -->
                    <div style="display: flex; justify-content: flex-end; margin-bottom: 25px;">
                        <div style="width: 280px;">
                            <div style="display: flex; justify-content: space-between; padding: 6px 12px; border-bottom: 1px solid #e2e8e0;">
                                <span style="color: #5a7052; font-size: 11px; font-weight: 500;">${t.subtotal}</span>
                                <span style="font-weight: 600; color: #1e3318; font-size: 11px;">${formatCurrency(subtotal)}</span>
                            </div>
                            ${taxAmount > 0 ? `
                            <div style="display: flex; justify-content: space-between; padding: 6px 12px; border-bottom: 1px solid #e2e8e0;">
                                <span style="color: #5a7052; font-size: 11px; font-weight: 500;">${t.vat} (${taxRate}%)</span>
                                <span style="font-weight: 600; color: #1e3318; font-size: 11px;">${formatCurrency(taxAmount)}</span>
                            </div>` : ''}
                            <div style="margin-top: 10px; background: #2e4a23; color: #fff; padding: 12px; border-radius: 4px; display: flex; justify-content: space-between; align-items: baseline;">
                                <span style="font-size: 10px; font-weight: 700; text-transform: uppercase;">${t.grandTotal}</span>
                                <span style="font-size: 20px; font-weight: 800;">${formatCurrency(grandTotal)}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Footer -->
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 30px; border-top: 1px solid #e2e8e0; padding-top: 15px; margin-bottom: 20px;">
                        <div style="flex: 1;">
                            <div style="font-weight: 700; color: #5a7052; text-transform: uppercase; font-size: 9px; margin-bottom: 8px;">${t.notes}</div>
                            <div style="font-size: 11px; color: #5a7052; line-height: 1.5;">
                                <div style="margin-bottom: 2px;">${t.paymentTerms}</div>
                                <div style="font-weight: 500; font-family: monospace; background: #fafbf9; padding: 12px; border: 1px solid #ebf0e9; border-radius: 6px; font-size: 10px; line-height: 1.6;">
                                    ${(s.bankInfo || t.bankInfo).split('\n').map(line => `<div style="margin-bottom: 2px;">• ${line.trim()}</div>`).join('')}
                                </div>
                            </div>
                        </div>
                        <div style="text-align: center;">
                            <div style="display: inline-block; padding: 6px; background: #fff; border: 2px solid #2e4a23; border-radius: 8px; margin-bottom: 4px;">
                                <div style="width: 50px; height: 50px; display: flex; align-items: center; justify-content: center;">
                                     <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 2px;">
                                        ${Array(16).fill('<div style="width: 6px; height: 6px; background: #2e4a23;"></div>').join('')}
                                    </div>
                                </div>
                            </div>
                            <div style="font-size: 8px; font-weight: 800; color: #2e4a23; text-transform: uppercase;">Scan to pay</div>
                        </div>
                    </div>
                    ` : ''}

                    <!-- Banner Foot -->
                    <div style="position: absolute; bottom: 20px; left: 0; right: 0; padding: 12px; text-align: center; color: #5a7052; font-size: 10px;">
                        — ${s.footerText || t.thanks} —
                    </div>
                </div>
            `;
        });
    };

    const refreshBody = () => {
        const dummyLang = INVOICE_I18N[currentLang];
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
                        position: absolute !important;
                        top: 50% !important;
                        left: 50% !important;
                        transform: translate(-50%, -50%) scale(0.6) rotate(90deg) !important;
                        opacity: 1;
                        border: 1px solid #ddd;
                        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                    }
                    
                    #invoice-doc-container.printing-2up-portrait .print-sheet {
                        display: block !important;
                        width: 210mm;
                        height: 297mm;
                        background: white;
                        margin-bottom: 40px;
                        box-shadow: 0 10px 30px rgba(0,0,0,0.1);
                        position: relative;
                    }

                    #invoice-doc-container.printing-2up-portrait .sheet-half {
                        width: 100%;
                        height: 50%;
                        position: relative;
                        border-bottom: 2px dashed #f0f0f0;
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

                    /* Portrait 2-up (Sideways Stack) */
                    .print-sheet {
                        display: block !important;
                        position: relative !important;
                        width: 210mm !important;
                        height: 296mm !important; /* Safety buffer */
                        page-break-after: always !important;
                        overflow: hidden !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        background: white !important;
                    }

                    .sheet-half {
                        width: 210mm !important;
                        height: 148mm !important;
                        position: relative !important;
                        overflow: hidden !important;
                    }

                    body.printing-2up-portrait .invoice-page {
                        width: 210mm !important;
                        height: 297mm !important;
                        position: absolute !important;
                        top: 50% !important;
                        left: 50% !important;
                        transform: translate(-50%, -50%) rotate(90deg) scale(0.68) !important;
                        transform-origin: center center !important;
                        margin: 0 !important;
                        padding: 10mm 15mm !important;
                        page-break-after: auto !important;
                        background: white !important;
                    }

                    .invoice-page:last-child {
                        page-break-after: auto !important;
                    }

                    .invoice-page * {
                        overflow: visible !important;
                    }
                }
            </style>
        `;

        // Event Listeners
        document.getElementById('lang-en').addEventListener('click', () => { currentLang = 'en'; refreshBody(); });
        document.getElementById('lang-ru').addEventListener('click', () => { currentLang = 'ru'; refreshBody(); });
        document.getElementById('prev-page').addEventListener('click', () => { if (currentPage > 1) { currentPage--; refreshBody(); } });
        document.getElementById('next-page').addEventListener('click', () => { if (currentPage < realTotalPages) { currentPage++; refreshBody(); } });

        document.getElementById('zoom-slider').addEventListener('input', (e) => {
            invoiceScale = parseFloat(e.target.value);
            const activePage = container.querySelector('.invoice-page.active-page');
            if (activePage) activePage.style.transform = `scale(${invoiceScale})`;
            e.target.nextElementSibling.textContent = `${Math.round(invoiceScale * 100)}%`;
        });

        document.getElementById('btn-print-portrait').addEventListener('click', () => {
            document.body.classList.remove('printing-2up-portrait');
            window.print();
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
            }, 1000);
        });
    };

    refreshBody();
};
