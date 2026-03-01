// Mock required data to test if the template generates successfully
import { generateInvoicePages } from './js/components/invoiceTemplate.js';

const mockInvoice = {
    id: "test1234",
    invoiceNumber: "INV-0001",
    customerName: "Test Customer",
    createdAt: new Date(),
    subtotal: 1000,
    totalAmount: 1000,
    items: [
        { productId: "prod1", name: "Test Product", quantity: 10, price: 100 }
    ]
};

const mockProductMap = {
    "prod1": { name_en: "Test Product EN", name_ru: "Test Product RU" }
};

const mockLiveSettings = {
    companyName: "Test Company"
};

try {
    const html = generateInvoicePages({
        invoice: mockInvoice,
        liveSettings: mockLiveSettings,
        productMap: mockProductMap,
        currentLang: 'en',
        invoiceScale: 1.0,
        currentPage: 1,
        isCopy: false,
        formatDate: (d) => "2023-01-01",
        formatCurrency: (c) => "$100"
    });

    console.log("SUCCESS! HTML generated. Length:", html[0].length);
} catch (e) {
    console.error("RUNTIME ERROR IN TEMPLATE:", e);
}
