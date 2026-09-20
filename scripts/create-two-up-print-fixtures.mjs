// Local, synthetic print fixtures. No production reads, writes, or print-status updates.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import http from 'node:http';
import { build } from 'esbuild';
import QRCode from 'qrcode';

globalThis.localStorage = { getItem: function() { return 'en'; } };
const { buildInvoicePrintPages } = await import('../js/services/invoicePrintTemplate.js');
const root = process.cwd();
const output = path.join(root, 'output/playwright/two-up');
fs.mkdirSync(output, { recursive: true });
function section(source, start, end) { return source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start))); }
function escapeHtml(value) { return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
const nativeSource = fs.readFileSync('js/services/nativeInvoicePrintService.js', 'utf8');
const context = vm.createContext({ escapeHtml: escapeHtml });
vm.runInContext(section(nativeSource, 'export function buildNativePrintDocument(', 'async function waitForPrintAssets(').replace('export function', 'function'), context);
const viewSource = fs.readFileSync('js/views/invoiceView.js', 'utf8');
const styleStart = viewSource.indexOf('<style>', viewSource.indexOf('const refreshBody ='));
const style = viewSource.slice(styleStart, viewSource.indexOf('</style>', styleStart) + 8);
const qr = 'data:image/png;base64,' + fs.readFileSync('Payment QR Code.png').toString('base64');
const invoiceQr = await QRCode.toDataURL('SYNTHETIC-INVOICE-PRINT-VERIFICATION', { width: 300 });
const settings = { companyName: 'Kyrgyz Organics', invoiceItemsPerPage: 7, paymentQrImageUrl: qr };
function invoice(number, count) {
    return {
        id: number, orderId: number, invoiceNumber: number, customerName: 'Test Cafe — Бишкек', orderDate: '2026-09-13', createdAt: '2026-09-13', status: 'confirmed', invoiceQrDataUrl: invoiceQr,
        items: Array.from({ length: count }, function(value, index) { return { name: 'Bread / Хлеб ' + (index + 1), quantity: 3, price: 125 }; }), totalAmount: count * 375
    };
}
const single = invoice('TEST-001', 3);
const twoPage = invoice('TEST-014', 14);
const long = invoice('TEST-041', 41);
const records = [single, invoice('TEST-002', 5), long];
for (const paperSize of ['letter', 'legal', 'a3', 'a5']) {
    const pages = buildInvoicePrintPages({ invoice: single, settings: settings, showAllPages: true });
    fs.writeFileSync(path.join(output, 'native-' + paperSize + '.html'), context.buildNativePrintDocument(pages, 'two-up-portrait', 'http://127.0.0.1:8766/', paperSize));
}
for (const [name, list] of [['single', [single]], ['odd-batch', records], ['multipage', [long]]]) {
    const pages = list.flatMap(function(record) { return buildInvoicePrintPages({ invoice: record, settings: settings, showAllPages: true }); });
    fs.writeFileSync(path.join(output, 'native-' + name + '.html'), context.buildNativePrintDocument(pages, 'two-up-portrait', 'http://127.0.0.1:8766/', 'a4'));
}
for (const record of [single, twoPage, long]) {
    const originals = buildInvoicePrintPages({ invoice: record, settings: settings, currentPage: 2, scale: 1.5, showAllPages: true });
    const copies = buildInvoicePrintPages({ invoice: record, settings: settings, currentPage: 2, scale: 1.5, showAllPages: true, isCopy: true });
    const sheets = originals.map(function(page, index) { return '<div class="print-sheet"><div class="sheet-half">' + page + '</div><div class="sheet-half">' + copies[index] + '</div></div>'; });
    // Include the real preview's flex wrapper: omitting it hides print fragmentation bugs.
    const wrapper = viewSource.match(/<div class="print-wrapper invoice-document"[^>]*>/)[0];
    fs.writeFileSync(path.join(output, 'individual-' + record.invoiceNumber + '.html'), '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/css/styles.css">' + style + '<body><div id="invoice-doc-container" class="printing-2up-portrait">' + wrapper + sheets.join('') + '</div></div>');
}
await build({
    entryPoints: ['js/services/bulkInvoicePrintService.js'], bundle: true, outfile: path.join(output, 'bulk-service.js'), format: 'iife', globalName: 'bulkTest',
    plugins: [{ name: 'synthetic-print-data', setup: function(api) {
        api.onResolve({ filter: /\/(sessionDataStore|invoiceService|qrService)\.js$/ }, function(args) { return { path: args.path, namespace: 'fixture' }; });
        api.onLoad({ filter: /.*/, namespace: 'fixture' }, function(args) {
            if (args.path.includes('sessionDataStore')) return { contents: 'export default {getInvoicesSnapshot:function(){return {records:window.fixtureRecords}}};' };
            if (args.path.includes('invoiceService')) return { contents: 'export const invoiceService={getInvoicesByOrderIds:async function(){throw new Error("Unexpected production lookup")}};' };
            return { contents: 'export const qrService={ensureInvoiceToken:async function(invoice){return invoice},generateQrDataUrl:async function(invoice){return invoice.invoiceQrDataUrl}};' };
        });
    } }]
});
fs.writeFileSync(path.join(output, 'bulk.html'), '<!doctype html><meta charset="utf-8"><title>Synthetic Quick Print verification</title><script src="/vendor/jspdf.umd.min.js"></script><script src="/vendor/html2canvas.min.js"></script><script>window.fixtureRecords=' + JSON.stringify(records) + ';window.fixtureSettings=' + JSON.stringify(settings) + ';</script><script src="bulk-service.js"></script><p>Local synthetic invoices only</p><script>window.generateTestPdf=async function(){var preview={closed:false,document:{body:{},title:""},location:{replace:function(url){window.testPdfUrl=url}}};window.testPdf=await bulkTest.bulkInvoicePrintService.generateCombinedPdf(window.fixtureRecords.map(function(invoice){return invoice.orderId}),"two-up-portrait",{settings:window.fixtureSettings,language:"en"},{previewWindow:preview});return window.testPdfUrl;};</script>');
const dailySource = fs.readFileSync('js/views/dailyOrdersView.js', 'utf8');
const daily = vm.createContext({ escapeHtml: escapeHtml, getProductName: function(item) { return item.name; }, formatQuantity: String, formatDateLabel: String });
vm.runInContext(section(dailySource, 'function renderPrintSlip(', 'function openPrintWindow('), daily);
for (const record of [single, long]) {
    fs.writeFileSync(path.join(output, 'daily-' + record.invoiceNumber + '.html'), daily.getPrintDocument(record, settings, 'two-up').replace('<head>', '<head><script>window.print=function(){window.printReady=true;};</script>'));
}
console.log('Created synthetic print fixtures in ' + output);
if (process.argv.includes('--serve')) {
    http.createServer(function(request, response) {
        const requested = path.resolve(root, '.' + decodeURIComponent(request.url.split('?')[0]));
        if (!requested.startsWith(root + path.sep)) { response.writeHead(403); response.end(); return; }
        fs.readFile(requested, function(error, bytes) {
            if (error) { response.writeHead(404); response.end(); return; }
            response.setHeader('Content-Type', requested.endsWith('.html') ? 'text/html; charset=utf-8' : requested.endsWith('.js') ? 'application/javascript' : requested.endsWith('.png') ? 'image/png' : 'application/octet-stream');
            response.end(bytes);
        });
    }).listen(8766, '127.0.0.1', function() { console.log('Fixture server: http://127.0.0.1:8766'); });
}
