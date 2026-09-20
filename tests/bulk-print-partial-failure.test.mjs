import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../js/services/bulkInvoicePrintService.js', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '')
    .replace('export const bulkInvoicePrintService', 'const bulkInvoicePrintService')
    .replace('export default bulkInvoicePrintService;', '');

function harness(invoices) {
    var sheets = [[]];
    var opened = 0;
    var pdf = {
        getNumberOfPages: function() { return sheets.length; },
        deletePage: function(number) { sheets.splice(number - 1, 1); },
        addPage: function() { sheets.push([]); },
        setProperties: function() {},
        addImage: function(canvas) { sheets[sheets.length - 1].push(canvas); },
        internal: { pageSize: { getWidth: function() { return 210; }, getHeight: function() { return 297; } } },
        setDrawColor: function() {}, setLineDashPattern: function() {}, line: function() {}
    };
    var context = vm.createContext({
        console: { info: function() {}, error: function() {} },
        syncSupportService: { recordIssue: async function() {} },
        sessionDataStore: {
            getInvoicesSnapshot: function() { return { records: invoices }; },
            updateInvoiceRecord: function() {}
        },
        invoiceService: {
            getInvoicesByOrderIds: async function() { throw new Error('sync unavailable'); },
            getInvoiceByOrderId: async function() { throw new Error('sync unavailable'); }
        },
        qrService: {
            ensureInvoiceToken: async function() { throw new Error('token sync failed'); },
            generateQrDataUrl: async function() { return 'data:image/png;base64,test'; }
        },
        buildInvoicePrintPages: function(options) { return options.invoice.pages; }
    });
    vm.runInContext(source, context);
    context.createPdf = function() { return pdf; };
    context.capturePage = async function(label) {
        if (label === 'broken') throw new Error('image failed');
        return label;
    };
    context.createRotatedHalfCanvas = function(canvas) { return canvas; };
    context.yieldToBrowser = async function() {};
    context.openPdfBlob = function() { opened += 1; return {}; };
    return { context: context, sheets: sheets, opened: function() { return opened; } };
}
function invoice(id, overrides) {
    return Object.assign({ id: id, orderId: id, invoiceNumber: id, items: [], secureToken: 'token', pages: [id] }, overrides);
}

for (const layout of ['full', 'two-up-portrait']) {
    test('Quick Print skips sync and data failures and removes partial invoices: ' + layout, async function() {
        var invoices = [invoice('token-failure', { secureToken: '' }), invoice('good'), invoice('partial', { pages: ['partial-page', 'broken'] }), invoice('invalid', { items: null }), invoice('last', { syncStatus: 'error' })];
        var h = harness(invoices);
        var result = await h.context.generateCombinedPdf(['token-failure', 'good', 'partial', 'invalid', 'missing', 'last'], layout, {}, {});
        assert.equal(result.invoiceCount, 2);
        assert.equal(result.failedInvoices.length, 4);
        assert.match(result.failedInvoices.join(';'), /token sync failed/);
        assert.match(result.failedInvoices.join(';'), /Order missing: sync unavailable/);
        assert.deepEqual(h.sheets, layout === 'full' ? [['good'], ['last']] : [['good', 'good'], ['last', 'last']]);
        assert.equal(h.opened(), 1);
        assert.equal(h.context.isGenerationActive(), false);
    });
}

test('Quick Print fails clearly without opening an empty PDF when every invoice fails', async function() {
    var h = harness([invoice('bad', { secureToken: '' })]);
    await assert.rejects(h.context.generateCombinedPdf(['bad'], 'full', {}, {}), /token sync failed/);
    assert.equal(h.opened(), 0);
    assert.equal(h.context.isGenerationActive(), false);
});

