import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

var bulkSource = fs.readFileSync(new URL('../js/services/bulkInvoicePrintService.js', import.meta.url), 'utf8');
function section(source, start, end) { return source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start))); }

test('Quick Print paints the prepared QR into the raster at its measured offscreen position', function() {
    var draw;
    var canvas = { width: 1600, height: 2240, getContext: function() { return { save: function() {}, setTransform: function() { assert.deepEqual(Array.from(arguments), [1, 0, 0, 1, 0, 0]); }, restore: function() {}, drawImage: function() { draw = Array.from(arguments); } }; } };
    var page = { scrollWidth: 800, scrollHeight: 1120, getBoundingClientRect: function() { return { left: -12000, top: 0 }; } };
    var qr = { getBoundingClientRect: function() { return { left: -11670, top: 40, width: 132, height: 132 }; } };
    var context = vm.createContext({});
    vm.runInContext(section(bulkSource, 'function drawInvoiceQrOnCapture(', 'function addFullPage('), context);
    context.drawInvoiceQrOnCapture(canvas, page, qr);
    assert.equal(draw[0], qr);
    assert.deepEqual(draw.slice(1), [660, 80, 264, 264]);
});

test('Quick Print renders two copies of each invoice page for single, odd, even and multipage batches', async function() {
    for (var labels of [['A1'], ['A1', 'B1'], ['A1', 'B1', 'C1'], ['A1,A2,A3', 'B1']]) {
        var sheets = [[]];
        var invoices = labels.map(function(label) { return { invoiceNumber: label, pages: label.split(',') }; });
        var pdf = {
            addPage: function() { sheets.push([]); },
            addImage: function(canvas, format, x, y) { sheets[sheets.length - 1].push({ label: canvas, y: y }); },
            setDrawColor: function() {}, setLineDashPattern: function() {}, line: function() {}
        };
        var context = vm.createContext({
            generationActive: false, activeOperationId: 0,
            loadPrintableInvoices: async function() { return invoices; }, validateInvoice: function() {},
            createPdf: function() { return pdf; }, getPageSize: function() { return { width: 210, height: 297 }; },
            createRotatedHalfCanvas: function(canvas) { return canvas; },
            prepareInvoiceQr: async function(invoice) { return invoice; },
            buildInvoicePrintPages: function(options) { return options.invoice.pages; },
            capturePage: async function(label) { return label; },
            emitProgress: function() {}, getInvoiceLabel: function(invoice) { return invoice.invoiceNumber; },
            buildFilename: function() { return 'test.pdf'; }, openPdfBlob: function() { return {}; },
            yieldToBrowser: async function() {}, console: { info: function() {}, error: function() {} }
        });
        vm.runInContext(section(bulkSource, 'function addTwoUpSheet(', 'function yieldToBrowser(') + section(bulkSource, 'async function generateCombinedPdf(', 'function isGenerationActive('), context);
        await context.generateCombinedPdf(labels, 'two-up-portrait', {}, {});
        assert.equal(sheets.length, labels.join(',').split(',').length);
        sheets.forEach(function(sheet) {
            assert.equal(sheet.length, 2);
            assert.equal(sheet[0].label, sheet[1].label);
            assert.deepEqual(sheet.map(function(image) { return image.y; }), [0, 148.5]);
        });
    }
});

test('individual print preview keeps both copies mounted until afterprint and blocks duplicate print requests', async function() {
    var source = fs.readFileSync(new URL('../js/views/invoiceView.js', import.meta.url), 'utf8');
    var handlers = {};
    var calls = 0;
    var finished = 0;
    var timers = [];
    var qr = { complete: true, naturalWidth: 132 };
    var context = vm.createContext({
        printInProgress: false,
        document: { querySelectorAll: function() { return [qr, qr]; }, querySelector: function() { return qr; }, fonts: { ready: Promise.resolve() } },
        window: { addEventListener: function(event, callback) { handlers[event] = callback; }, removeEventListener: function(event) { delete handlers[event]; }, print: function() { calls += 1; } },
        requestAnimationFrame: function(callback) { callback(); }, setTimeout: function(callback) { timers.push(callback); },
        notificationService: { error: function(message) { assert.fail(message); } }, console: console
    });
    vm.runInContext(section(source, '            const printWithAfterprint =', "            document.getElementById('btn-print-portrait')") + '\nglobalThis.printJob = printWithAfterprint;', context);
    await context.printJob(function() { finished += 1; });
    timers.forEach(function(callback) { callback(); });
    assert.equal(finished, 0, 'No elapsed-time fallback may remove the duplicate pages');
    await context.printJob(function() { finished += 1; });
    assert.equal(calls, 1);
    handlers.afterprint();
    assert.equal(finished, 1);
    assert.equal(context.printInProgress, false);
});

test('long Daily Orders paginate with two complete copies of every item', function() {
    var source = fs.readFileSync(new URL('../js/views/dailyOrdersView.js', import.meta.url), 'utf8');
    var context = vm.createContext({ escapeHtml: String, getProductName: function(item) { return item.name; }, formatQuantity: String, formatDateLabel: String });
    vm.runInContext(section(source, 'function renderPrintSlip(', 'function openPrintWindow('), context);
    var items = Array.from({ length: 41 }, function(value, index) { return { name: 'Item-' + index + '-end', quantity: 3 }; });
    var html = context.getPrintDocument({ items: items, customerName: 'Cafe', orderDate: '2026-09-13', notes: 'Last-page note' }, {}, 'two-up');
    assert.equal((html.match(/class="sheet"/g) || []).length, 4);
    assert.equal((html.match(/class="order-slip"/g) || []).length, 8);
    items.forEach(function(item) { assert.equal(html.split(item.name).length - 1, 2); });
    assert.equal(html.split('Last-page note').length - 1, 2);
});

test('a queued archive of a server-confirmed missing order completes without discarding updates or restores', async function() {
    var source = fs.readFileSync(new URL('../js/services/syncService.js', import.meta.url), 'utf8');
    var context = vm.createContext({
        db: {}, doc: function() { return {}; }, getLocalOrderSnapshot: function() { return {}; },
        getDocFromServer: async function() { return { exists: function() { return false; } }; }
    });
    vm.runInContext(section(source, 'async function writeOrderArchive(', 'async function processOrderQueueItem('), context);
    await context.writeOrderArchive({ actionType: 'archiveOrder', entityId: 'gone' });
    await assert.rejects(context.writeOrderArchive({ actionType: 'updateOrder', entityId: 'gone' }), /not found/);
    await assert.rejects(context.writeOrderArchive({ actionType: 'unarchiveOrder', entityId: 'gone' }), /not found/);
    context.getDocFromServer = async function() { throw new Error('unavailable'); };
    await assert.rejects(context.writeOrderArchive({ actionType: 'archiveOrder', entityId: 'gone' }), /unavailable/);
});
