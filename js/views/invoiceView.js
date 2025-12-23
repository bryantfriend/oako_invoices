import { layoutView } from "./layoutView.js";
import { invoiceController } from "../controllers/invoiceController.js";
import { LoadingSkeleton } from "../components/loadingSkeleton.js";
import { formatDate, formatCurrency } from "../core/formatters.js";
import { createCard } from "../components/card.js";
import { createStatusBadge } from "../components/statusBadge.js";
import { DataTable } from "../components/dataTable.js";

import { router } from "../router.js";
import { ROUTES } from "../core/constants.js";

export const renderInvoices = async () => {
    layoutView.render();
    layoutView.updateTitle("Invoices");
    const container = document.getElementById('page-container');
    container.innerHTML = LoadingSkeleton();

    // Load Data
    const invoices = await invoiceController.loadAllInvoices();

    // Create Table
    const table = new DataTable({
        columns: [
            { key: 'invoiceNumber', label: 'Invoice #', render: (val) => `<span style="font-family: monospace; font-weight: 600;">${val}</span>` },
            { key: 'customerName', label: 'Customer' },
            { key: 'createdAt', label: 'Date', render: (val) => formatDate(val?.toDate ? val.toDate() : val) },
            { key: 'totalAmount', label: 'Amount', render: (val) => formatCurrency(val || 0) },
        ],
        data: invoices,
        onRowClick: true,
        actions: (row) => `
            <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); window.viewInvoice('${row.id}')">
                View
            </button>
        `
    });

    container.innerHTML = `
        <div class="animate-fade-in">
             ${createCard({
        title: 'All Invoices',
        content: table.render()
    })}
        </div>
    `;

    // Row Click Listeners
    const rows = container.querySelectorAll('.data-row');
    rows.forEach(row => {
        row.addEventListener('click', () => {
            const id = row.dataset.id;
            router.navigate(ROUTES.INVOICE_DETAIL.replace(':id', id));
        });
    });

    // Global Action Helper
    window.viewInvoice = (id) => router.navigate(ROUTES.INVOICE_DETAIL.replace(':id', id));
};

export const renderInvoiceDetail = async ({ id }) => {
    layoutView.render();
    layoutView.updateTitle(`Invoice View`);

    const container = document.getElementById('page-container');
    container.innerHTML = LoadingSkeleton();

    const invoice = await invoiceController.loadInvoice(id);
    if (!invoice) {
        container.innerHTML = "Invoice not found";
        return;
    }

    container.innerHTML = `
        <div class="animate-fade-in" style="max-width: 1000px; margin: 0 auto; display: grid; grid-template-columns: 1fr 300px; gap: var(--space-6);">
            
            <!-- Invoice Document Preview -->
            <div class="invoice-frame" style="
                background: white; 
                padding: 48px; 
                box-shadow: 0 10px 30px rgba(0,0,0,0.1); 
                min-height: 800px;
                color: var(--color-gray-900);
            ">
                <!-- Header -->
                <div style="display: flex; justify-content: space-between; margin-bottom: 48px;">
                    <div>
                        <h1 style="font-size: 24px; color: var(--color-primary-600); font-weight: 700;">Kyrgyz Organics</h1>
                        <div style="color: var(--color-gray-500); font-size: 14px; margin-top: 8px;">
                            123 Organic Way<br>
                            Bishkek, Kyrgyzstan<br>
                            info@kyrgyzorganics.com
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <h2 style="font-size: 32px; font-weight: 300; color: var(--color-gray-400); margin-bottom: 8px;">INVOICE</h2>
                        <div style="font-weight: 600;">${invoice.invoiceNumber}</div>
                        <div style="color: var(--color-gray-500); font-size: 14px;">Date: ${formatDate(invoice.createdAt?.toDate?.() || invoice.createdAt)}</div>
                    </div>
                </div>

                <!-- Bill To -->
                <div style="margin-bottom: 48px; display: flex; gap: 48px;">
                    <div style="flex: 1;">
                        <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--color-gray-400); margin-bottom: 8px;">Bill To</div>
                        <div style="font-weight: 600; font-size: 18px;">${invoice.customerName}</div>
                        <!-- Address would go here if we had it -->
                    </div>
                    <div style="flex: 1;">
                        <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--color-gray-400); margin-bottom: 8px;">Payment Details</div>
                        <div style="font-size: 14px;">
                            Bank Transfer<br>
                            IBAN: KG00 0000 0000 0000<br>
                            SWIFT: KYRGKZ22
                        </div>
                    </div>
                </div>

                <!-- Items -->
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 48px;">
                    <thead>
                        <tr style="border-bottom: 2px solid var(--color-gray-900);">
                            <th style="text-align: left; padding: 12px 0;">Description</th>
                            <th style="text-align: center; padding: 12px 0;">Qty</th>
                            <th style="text-align: right; padding: 12px 0;">Price</th>
                            <th style="text-align: right; padding: 12px 0;">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${invoice.items.map(item => `
                            <tr style="border-bottom: 1px solid var(--color-gray-200);">
                                <td style="padding: 16px 0;">${item.name}</td>
                                <td style="padding: 16px 0; text-align: center;">${item.adjustedQuantity ?? item.quantity}</td>
                                <td style="padding: 16px 0; text-align: right;">${formatCurrency(item.price)}</td>
                                <td style="padding: 16px 0; text-align: right;">${formatCurrency((item.adjustedQuantity ?? item.quantity) * item.price)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>

                <!-- Totals -->
                <div style="display: flex; justify-content: flex-end;">
                    <div style="width: 250px;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                            <span style="color: var(--color-gray-500);">Subtotal</span>
                            <span>${formatCurrency(invoice.totalAmount)}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 16px;">
                            <span style="color: var(--color-gray-500);">Tax (0%)</span>
                            <span>$0.00</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; border-top: 2px solid var(--color-gray-900); padding-top: 16px; font-weight: 700; font-size: 18px;">
                            <span>Total</span>
                            <span>${formatCurrency(invoice.totalAmount)}</span>
                        </div>
                    </div>
                </div>

                <!-- Footer -->
                <div style="margin-top: 80px; text-align: center; color: var(--color-gray-400); font-size: 12px;">
                    Thank you for your business. Please process payment within 30 days.
                </div>
            </div>

            <!-- Sidebar Actions -->
            <div style="display: flex; flex-direction: column; gap: var(--space-4);">
                ${createCard({
        title: 'Actions',
        content: `
                        <button class="btn btn-primary" style="width: 100%; margin-bottom: 8px;" onclick="window.print()">
                            🖨️ Print Invoice
                        </button>
                        <button class="btn btn-secondary" style="width: 100%;" onclick="alert('Download feature requires backend generation or jspdf library integration.')">
                            ⬇️ Download PDF
                        </button>
                    `
    })}
            </div>
        </div>

        <style>
            @media print {
                body * {
                    visibility: hidden;
                }
                .invoice-frame, .invoice-frame * {
                    visibility: visible;
                }
                .invoice-frame {
                    position: absolute;
                    left: 0;
                    top: 0;
                    width: 100%;
                    box-shadow: none !important;
                    padding: 0 !important;
                }
                .sidebar, .top-bar, .card, button {
                    display: none !important;
                }
            }
        </style>
    `;
};
