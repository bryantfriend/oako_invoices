import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { EventEmitter } from 'node:events';
import managerModule from '../desktop/printManager.cjs';
import pipeline from '../js/ICF/engine/pipeline.js';
import { createSaveDesktopPrintSettingsIntent } from '../desktop/renderer/printing/SaveDesktopPrintSettingsIntent.js';
import { createChooseDesktopPdfFolderIntent } from '../desktop/renderer/printing/ChooseDesktopPdfFolderIntent.js';
import { createPrintDesktopInvoicesIntent } from '../desktop/renderer/printing/PrintDesktopInvoicesIntent.js';
import { createFileDesktopInvoicesIntent } from '../desktop/renderer/printing/FileDesktopInvoicesIntent.js';
import { loadModule } from './helpers/load-isolated-module.mjs';

test('all desktop printing actions run six stages and reject unverified or mismatched staff', async function() {
    var calls = 0;
    var api = {
        getVerifiedUser: function() { return { id: 'staff', isAdmin: true }; },
        savePrintSettings: async function() { calls += 1; return { copies: 2 }; },
        choosePdfFolder: async function() { calls += 1; return { folder: 'chosen' }; },
        printInvoices: async function() { calls += 1; return { submitted: true }; },
        fileInvoices: async function() { calls += 1; return { filedPath: 'file.pdf' }; }
    };
    var factories = [createSaveDesktopPrintSettingsIntent, createChooseDesktopPdfFolderIntent, createPrintDesktopInvoicesIntent, createFileDesktopInvoicesIntent];
    for (var factory of factories) {
        var payload = { windowName: 'ko-invoice-print-100-1', label: 'invoice' };
        var intent = factory({ id: 'staff' }, payload, api);
        assert.deepEqual(Object.keys(intent.stages), ['Validate', 'Normalize', 'AddContext', 'Authorize', 'Process', 'Emit']);
        assert.equal((await pipeline.run(intent)).ok, true);
        assert.equal((await pipeline.run(factory({ id: 'other' }, payload, api))).ok, false);
    }
    assert.equal(calls, 4);
    api.getVerifiedUser = function() { return { id: 'staff', isAdmin: false }; };
    assert.equal((await pipeline.run(createPrintDesktopInvoicesIntent({ id: 'staff' }, { windowName: 'ko-invoice-print-100-1', label: 'invoice' }, api))).ok, false);
    assert.equal(calls, 4);
});

test('saved printer and PDF folder survive restart; renderer cannot replace the selected folder', async function() {
    var directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ko-print-test-'));
    var options = {
        userData: directory,
        getPrinters: async function() { return [{ name: 'Printer A' }]; },
        chooseFolder: async function() { return { canceled: false, filePaths: [path.join(directory, 'pdfs')] }; }
    };
    try {
        var manager = managerModule.createPrintManager(options);
        await assert.rejects(manager.saveSettings({ deviceName: '', copies: 1, paperSize: 'A4', autoFile: true }), /Choose a PDF folder/);
        await manager.chooseFolder();
        var saved = await manager.saveSettings({ deviceName: 'Printer A', directPrint: true, copies: 2, paperSize: 'Letter', autoFile: true, folder: 'C:\\Windows' });
        assert.equal(saved.folder, path.join(directory, 'pdfs'));
        assert.equal((await managerModule.createPrintManager(options).getSettings()).deviceName, 'Printer A');
        await assert.rejects(manager.saveSettings({ deviceName: 'Missing', directPrint: true, copies: 1, paperSize: 'A4' }), /unavailable/);
        await assert.rejects(manager.saveSettings({ deviceName: '', copies: 99, paperSize: 'A4' }), /Copies/);
        await assert.rejects(manager.saveSettings({ deviceName: '', copies: 1, paperSize: 'arbitrary' }), /paper/);
    } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('direct printing uses the saved printer, files once, and rejects unrelated or closed windows', async function() {
    var directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ko-print-test-'));
    var printOptions;
    var pdfCalls = 0;
    var printers = [{ name: 'Printer A' }];
    var window = new EventEmitter();
    window.isDestroyed = function() { return false; };
    window.webContents = {
        getURL: function() { return 'about:blank'; },
        printToPDF: async function(options) { pdfCalls += 1; assert.equal(options.preferCSSPageSize, true); return Buffer.from('%PDF-test'); },
        print: function(options, callback) { printOptions = options; callback(true); }
    };
    var manager = managerModule.createPrintManager({ userData: directory, getPrinters: async function() { return printers; }, chooseFolder: async function() { return { canceled: false, filePaths: [path.join(directory, 'pdfs')] }; } });
    var payload = { windowName: 'ko-invoice-print-100-1', label: '../../CON: invoice' };
    try {
        await manager.chooseFolder();
        await manager.saveSettings({ deviceName: 'Printer A', directPrint: true, copies: 2, paperSize: 'A4', autoFile: true });
        await assert.rejects(manager.printJob(payload), /Reopen/);
        manager.registerWindow(window, { frameName: payload.windowName, url: 'about:blank' });
        var result = await manager.printJob(payload);
        assert.equal(result.submitted, true);
        assert.equal(result.isPrinted, undefined);
        assert.equal(printOptions.silent, true);
        assert.equal(printOptions.deviceName, 'Printer A');
        assert.equal(printOptions.copies, 2);
        assert.equal(result.filedPath.startsWith(path.join(directory, 'pdfs') + path.sep), true);
        assert.equal((await fs.readFile(result.filedPath)).toString(), '%PDF-test');
        assert.equal((await manager.savePdf(payload)).filedPath, result.filedPath);
        assert.equal(pdfCalls, 1);
        printers = [];
        await assert.rejects(manager.printJob(payload), /unavailable/);
        window.webContents.getURL = function() { return 'https://example.com'; };
        await assert.rejects(manager.savePdf(payload), /Only the prepared/);
        window.emit('closed');
        await assert.rejects(manager.savePdf(payload), /Reopen/);
    } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('a first installation attempts cloud reads before connectivity diagnostics finish', async function() {
    var snapshot = { browserOnline: true, mode: 'offline', checkedAt: '' };
    var status = (await loadModule('js/services/offlineStatusService.js', { connectionStateService: { connectionStateService: { getSnapshot: function() { return snapshot; } } } })).offlineStatusService;
    assert.equal(status.canAttemptCloudRead(), true);
    snapshot = { browserOnline: true, mode: 'offline', checkedAt: '2026-10-04' };
    assert.equal(status.canAttemptCloudRead(), false);
    snapshot = { browserOnline: false, mode: 'offline', checkedAt: '' };
    assert.equal(status.canAttemptCloudRead(), false);
});

test('cold Firestore cache misses query the server instead of becoming empty results', async function() {
    var reads = 0;
    var snapshot = { browserOnline: true, mode: 'offline', checkedAt: '' };
    var row = { id: 'customer', companyName: 'Saved customer' };
    var module = await loadModule('js/core/firestoreRead.js', {
        'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js': {
            getDocsFromCache: async function() { return { docs: [] }; },
            getDocsFromServer: async function() { reads += 1; return { docs: [{ id: row.id, data: function() { return { companyName: row.companyName }; } }], metadata: { fromCache: false } }; }
        },
        connectionStateService: { connectionStateService: { getSnapshot: function() { return snapshot; } } },
        offlineDexieDb: { openOfflineDexieDatabase: async function() { return {}; } }
    });
    assert.equal((await module.getDocsWithCache({}, { cacheKey: 'customers:all' }))[0].id, row.id);
    assert.equal(reads, 1);
    snapshot = { browserOnline: false, mode: 'offline', checkedAt: '' };
    assert.equal((await module.getDocsWithCache({}, { cacheKey: 'empty' })).length, 0);
    assert.equal(reads, 1);
});

test('an unavailable server and empty SDK cache never become an authoritative empty collection', async function() {
    var module = await loadModule('js/core/firestoreRead.js', {
        'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js': {
            getDocsFromServer: async function() { throw new Error('server unavailable'); },
            getDocsFromCache: async function() { return { docs: [] }; }
        },
        connectionStateService: { connectionStateService: { getSnapshot: function() { return { browserOnline: true, mode: 'online', checkedAt: 'checked' }; } } },
        offlineDexieDb: { openOfflineDexieDatabase: async function() { return {}; } },
        firestoreDiagnostics: { logCollectionError: function() {}, createCollectionTimeoutError: function() { return new Error('timed out'); } }
    });
    await assert.rejects(module.getDocsWithCache({}, { cacheKey: 'empty' }), /server unavailable/);
});

test('staff profile reads retry cold transport failure but never retry permission rejection', async function() {
    var calls = 0;
    var permissionDenied = false;
    var module = await loadModule('js/core/staffProfileRead.js', {
        'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js': { getDocFromServer: async function() {
            calls += 1;
            if (permissionDenied) throw Object.assign(new Error('denied'), { code: 'permission-denied' });
            if (calls === 1) throw Object.assign(new Error('starting'), { code: 'unavailable' });
            return { exists: function() { return true; } };
        } }
    }, { setTimeout: function immediately(handler) { handler(); } });
    assert.equal((await module.readStaffProfileFromServer({})).exists(), true);
    assert.equal(calls, 2);
    permissionDenied = true;
    await assert.rejects(module.readStaffProfileFromServer({}), /denied/);
    assert.equal(calls, 3);
});
