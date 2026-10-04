import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { EventEmitter } from 'node:events';
import printModule from '../desktop/printManager.cjs';
import workflowModule from '../desktop/workflowManager.cjs';
import { buildDeliveryDocuments } from '../js/services/deliveryPrintDocuments.js';
import pipeline from '../js/ICF/engine/pipeline.js';
import { createPrintDesktopDeliveryRunIntent } from '../desktop/renderer/printing/PrintDesktopDeliveryRunIntent.js';
import { createSaveDesktopWorkflowSettingsIntent } from '../desktop/renderer/printing/SaveDesktopWorkflowSettingsIntent.js';
import { loadModule } from './helpers/load-isolated-module.mjs';

test('quick order drafts are isolated from the main editor and other staff accounts', async function() {
    var values = new Map();
    var window = { desktopApp: {}, location: { search: '' } };
    var actor = 'staff';
    var module = await loadModule('js/services/workflowLocalStore.js', { authService: { authService: { getCurrentUser: function() { return { uid: actor }; } } } }, {
        window: window, URLSearchParams: URLSearchParams,
        localStorage: { getItem: function(key) { return values.get(key); }, setItem: function(key, value) { values.set(key, value); } }
    });
    module.workflowLocalStore.write('draft', 'editor', { customerName: 'Main draft' });
    window.location.search = '?quick-order=1';
    assert.equal(module.workflowLocalStore.read('draft', 'editor', null), null);
    module.workflowLocalStore.write('draft', 'editor', { customerName: 'Quick draft' });
    window.location.search = '';
    assert.equal(module.workflowLocalStore.read('draft', 'editor', null).customerName, 'Main draft');
    actor = 'other';
    assert.equal(module.workflowLocalStore.read('draft', 'editor', null), null);
});

test('delivery and workflow intents include all six stages and require verified staff', async function() {
    var calls = 0;
    var api = { getVerifiedUser: function() { return { id: 'staff', isAdmin: true }; }, printDeliveryRun: async function() { calls += 1; return {}; }, saveWorkflowSettings: async function() { calls += 1; return {}; } };
    var payload = { windowName: 'ko-invoice-print-1-1', label: 'run', documents: ['invoice', 'packing', 'labels'].map(function(type, index) { return { type: type, windowName: 'ko-invoice-print-1-' + (index + 1) }; }) };
    for (var factory of [createPrintDesktopDeliveryRunIntent, createSaveDesktopWorkflowSettingsIntent]) {
        var intent = factory({ id: 'staff' }, payload, api);
        assert.deepEqual(Object.keys(intent.stages), ['Validate', 'Normalize', 'AddContext', 'Authorize', 'Process', 'Emit']);
        assert.equal((await pipeline.run(intent)).ok, true);
        assert.equal((await pipeline.run(factory({ id: 'intruder' }, payload, api))).ok, false);
    }
    assert.equal(calls, 2);
});

test('delivery run preflights printers and retries only failed documents without saving PDFs by default', async function() {
    var directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ko-delivery-'));
    var printed = [];
    var failLabels = true;
    var pdfCalls = 0;
    var printers = [{ name: 'Office' }, { name: 'Labels' }];
    var manager = printModule.createPrintManager({ userData: directory, getPrinters: async function() { return printers; } });
    try {
        assert.equal((await manager.getSettings()).autoFile, false);
        await manager.saveSettings({ deviceName: 'Office', directPrint: false, copies: 1, paperSize: 'A4', autoFile: false, labelDeviceName: 'Labels' });
        var documents = ['invoice', 'packing', 'labels'].map(function(type, index) {
            var window = new EventEmitter();
            window.isDestroyed = function() { return false; };
            window.webContents = { getURL: function() { return 'about:blank'; }, printToPDF: async function() { pdfCalls += 1; }, print: function(options, callback) {
                assert.equal(options.silent, true);
                printed.push(type);
                if (type === 'labels') { assert.equal(options.deviceName, 'Labels'); assert.equal(options.pageSize.width, 100000); }
                callback(!(type === 'labels' && failLabels), 'label printer jam');
            } };
            var name = 'ko-invoice-print-1-' + (index + 1);
            manager.registerWindow(window, { frameName: name, url: 'about:blank' });
            return { type: type, windowName: name };
        });
        var result = await manager.printDeliveryRun({ documents: documents, label: 'Delivery' });
        assert.deepEqual(result.submitted, ['invoice', 'packing']);
        assert.equal(result.complete, false);
        failLabels = false;
        result = await manager.printDeliveryRun({ documents: documents, label: 'Delivery' });
        assert.equal(result.complete, true);
        assert.deepEqual(printed, ['invoice', 'packing', 'labels', 'labels']);
        assert.equal(pdfCalls, 0);
        printers = [];
        await assert.rejects(manager.printDeliveryRun({ documents: documents }), /connected delivery printers/);
        assert.equal(printed.length, 4);
    } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('workflow preferences persist opt-outs and label documents exclude returned quantities and prices', async function() {
    var directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ko-workflow-'));
    var applied;
    var options = { userData: directory, shortcutAvailable: function() { return false; }, apply: function(settings) { applied = settings; } };
    try {
        var manager = workflowModule.createWorkflowManager(options);
        assert.equal((await manager.getSettings()).initialized, false);
        await manager.saveSettings({ background: false, startAtLogin: false, shortcut: false });
        assert.equal(applied.background, false);
        assert.equal((await workflowModule.createWorkflowManager(options).getSettings()).startAtLogin, false);
        await assert.rejects(manager.saveSettings({ background: 'true' }), /valid Windows/);
        var html = buildDeliveryDocuments([{ customerName: '<script>bad</script>', invoiceNumber: 'I-1', items: [{ name: 'Bread', quantity: 5, returnedQuantity: 2, price: 999 }, { name: 'Fully returned', quantity: 2, returnedQuantity: 2 }] }], { paperSize: 'A4', labelWidth: 100, labelHeight: 60 });
        assert.match(html.packing, /<td>3 /);
        assert.doesNotMatch(html.packing, /999|Fully returned|<script>/);
        assert.match(html.labels, /size:100mm 60mm/);
    } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
