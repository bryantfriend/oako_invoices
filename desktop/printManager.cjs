const fs = require('node:fs/promises');
const path = require('node:path');

const defaults = { deviceName: '', directPrint: false, copies: 1, paperSize: 'A4', autoFile: false, folder: '', packingDeviceName: '', labelDeviceName: '', labelWidth: 100, labelHeight: 60 };

function normalizeSettings(input, folder) {
    if (!input || typeof input.deviceName !== 'string' || input.deviceName.length > 500) throw new Error('Choose a valid printer.');
    if (!Number.isInteger(input.copies) || input.copies < 1 || input.copies > 20) throw new Error('Copies must be between 1 and 20.');
    if (['A4', 'Letter', 'Legal', 'A3', 'A5'].indexOf(input.paperSize) === -1) throw new Error('Choose a supported paper size.');
    if (input.directPrint === true && !input.deviceName) throw new Error('Choose a printer before enabling direct printing.');
    if (input.autoFile === true && !folder) throw new Error('Choose a PDF folder before enabling automatic filing.');
    var labelWidth = input.labelWidth === undefined ? 100 : Number(input.labelWidth);
    var labelHeight = input.labelHeight === undefined ? 60 : Number(input.labelHeight);
    if (!Number.isFinite(labelWidth) || labelWidth < 50 || labelWidth > 210 || !Number.isFinite(labelHeight) || labelHeight < 25 || labelHeight > 210) throw new Error('Choose label dimensions between 50–210 mm wide and 25–210 mm high.');
    return { deviceName: input.deviceName, directPrint: input.directPrint === true, copies: input.copies, paperSize: input.paperSize, autoFile: input.autoFile === true, folder: folder,
        packingDeviceName: String(input.packingDeviceName || ''), labelDeviceName: String(input.labelDeviceName || ''), labelWidth: labelWidth, labelHeight: labelHeight };
}

function safeFilePart(value) {
    var name = String(value || 'invoice').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '').slice(0, 80);
    if (!name || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = 'invoice_' + name;
    return name;
}

function createPrintManager(options) {
    var settingsFile = path.join(options.userData, 'desktop-print-settings.json');
    var settings;
    var jobs = new Map();
    var deliveryActive = false;

    async function getSettings() {
        if (!settings) {
            try {
                var saved = JSON.parse(await fs.readFile(settingsFile, 'utf8'));
                settings = normalizeSettings(saved, typeof saved.folder === 'string' ? saved.folder : '');
            } catch (error) {
                if (error.code !== 'ENOENT') console.warn('Desktop print settings could not be loaded; using defaults.');
                settings = Object.assign({}, defaults);
            }
        }
        return Object.assign({}, settings);
    }

    async function persist(next) {
        await fs.mkdir(options.userData, { recursive: true });
        await fs.writeFile(settingsFile + '.tmp', JSON.stringify(next, null, 2), 'utf8');
        await fs.rename(settingsFile + '.tmp', settingsFile);
        settings = next;
        return getSettings();
    }

    async function saveSettings(input) {
        var current = await getSettings();
        var next = normalizeSettings(input, current.folder);
        var printers = await options.getPrinters();
        for (var name of [next.deviceName, next.packingDeviceName, next.labelDeviceName]) {
            if (name && !printers.some(function matchesPrinter(printer) { return printer.name === name; })) throw new Error('The saved printer is unavailable. Choose a connected printer or use the print dialog.');
        }
        return persist(next);
    }

    async function chooseFolder() {
        var result = await options.chooseFolder();
        if (result.canceled || !result.filePaths.length) return getSettings();
        var current = await getSettings();
        current.folder = path.resolve(result.filePaths[0]);
        return persist(current);
    }

    function registerWindow(window, details) {
        if (!/^ko-invoice-print-\d+-\d+$/.test(details.frameName) || details.url !== 'about:blank') return;
        jobs.set(details.frameName, { window: window, busy: false, filedPath: '', deliverySubmitted: false });
        window.once('closed', function removeJob() { jobs.delete(details.frameName); });
    }

    function getJob(payload) {
        var job = jobs.get(payload.windowName);
        if (!job || job.window.isDestroyed()) throw new Error('Reopen the invoice print preview.');
        var url = job.window.webContents.getURL();
        if (url !== 'about:blank') throw new Error('Only the prepared invoice preview can be printed.');
        if (job.busy) throw new Error('This invoice print job is already running.');
        return job;
    }

    async function fileJob(job, payload, profile) {
        if (!profile.folder) throw new Error('Choose a PDF folder in Windows print settings first.');
        if (job.filedPath) return job.filedPath;
        var pdf = await job.window.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true, pageSize: profile.paperSize, margins: { top: 0, bottom: 0, left: 0, right: 0 } });
        var now = new Date();
        var day = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
        var directory = path.join(profile.folder, day);
        await fs.mkdir(directory, { recursive: true });
        var label = safeFilePart(payload.label);
        // Exclusive creation preserves older invoices, even when a job is reopened or reprinted.
        for (var index = 0; index < 100; index += 1) {
            var target = path.join(directory, label + '-' + now.getTime() + '-' + index + '.pdf');
            try {
                await fs.writeFile(target, pdf, { flag: 'wx' });
                job.filedPath = target;
                return target;
            } catch (error) {
                if (error.code !== 'EEXIST') throw error;
            }
        }
        throw new Error('Could not choose an unused PDF filename.');
    }

    async function savePdf(payload) {
        var job = getJob(payload);
        job.busy = true;
        try {
            return { filedPath: await fileJob(job, payload, await getSettings()) };
        } finally {
            job.busy = false;
        }
    }

    async function printJob(payload, override) {
        var job = getJob(payload);
        job.busy = true;
        try {
            var profile = Object.assign({}, await getSettings(), override || {});
            var filedPath = '';
            var filingError = '';
            if (profile.autoFile) {
                try { filedPath = await fileJob(job, payload, profile); }
                catch (error) { filingError = 'PDF filing failed: ' + error.message; }
            }
            if (profile.directPrint) {
                var printers = await options.getPrinters();
                if (!printers.some(function matchesPrinter(printer) { return printer.name === profile.deviceName; })) throw new Error('The saved printer is unavailable. Disable direct printing or choose a connected printer in Settings.');
            }
            await new Promise(function submitPrint(resolve, reject) {
                job.window.webContents.print({ silent: profile.directPrint, deviceName: profile.directPrint ? profile.deviceName : '', copies: profile.copies, pageSize: profile.paperSize, printBackground: true, margins: { marginType: 'none' } }, function printCompleted(success, reason) {
                    if (success) resolve();
                    else reject(new Error(reason || 'Printing was cancelled or failed.'));
                });
            });
            // Spooling never confirms physical paper or changes invoice status.
            return { submitted: true, filedPath: filedPath, filingError: filingError };
        } finally {
            job.busy = false;
        }
    }

    async function printDeliveryRun(payload) {
        if (deliveryActive) throw new Error('A delivery run is already printing.');
        if (!payload || !Array.isArray(payload.documents) || payload.documents.length !== 3) throw new Error('Prepare all three delivery documents.');
        var types = ['invoice', 'packing', 'labels'];
        var profile = await getSettings();
        var printerNames = [profile.deviceName, profile.packingDeviceName || profile.deviceName, profile.labelDeviceName || profile.deviceName];
        var printers = await options.getPrinters();
        var windowNames = new Set();
        for (var index = 0; index < types.length; index += 1) {
            var document = payload.documents[index];
            if (!document || document.type !== types[index] || windowNames.has(document.windowName)) throw new Error('The delivery documents are invalid.');
            windowNames.add(document.windowName);
            getJob(document);
            if (!printerNames[index] || !printers.some(function match(printer) { return printer.name === printerNames[index]; })) throw new Error('Choose connected delivery printers in Settings before printing the run.');
        }
        deliveryActive = true;
        var submitted = [];
        var failures = [];
        var primaryJob = getJob(payload.documents[0]);
        if (!primaryJob.deliverySubmittedTypes) primaryJob.deliverySubmittedTypes = new Set();
        try {
            for (var index = 0; index < types.length; index += 1) {
                var document = payload.documents[index];
                var job = getJob(document);
                if (primaryJob.deliverySubmittedTypes.has(document.type)) { submitted.push(document.type); continue; }
                try {
                    if (document.type !== 'invoice' && typeof job.window.hide === 'function') job.window.hide();
                    var result = await printJob({ windowName: document.windowName, label: String(payload.label || 'delivery-run').slice(0, 230) + '-' + document.type }, {
                        directPrint: true, deviceName: printerNames[index],
                        copies: document.type === 'labels' ? 1 : profile.copies,
                        paperSize: document.type === 'labels' ? { width: profile.labelWidth * 1000, height: profile.labelHeight * 1000 } : profile.paperSize,
                        autoFile: document.type === 'invoice' && profile.autoFile
                    });
                    primaryJob.deliverySubmittedTypes.add(document.type);
                    submitted.push(document.type);
                    if (result.filingError) failures.push({ type: 'PDF filing', message: result.filingError });
                } catch (error) { failures.push({ type: document.type, message: error.message }); }
            }
            return { submitted: submitted, failures: failures, complete: submitted.length === 3 };
        } finally { deliveryActive = false; }
    }

    return { getSettings: getSettings, saveSettings: saveSettings, chooseFolder: chooseFolder, registerWindow: registerWindow, printJob: printJob, savePdf: savePdf, printDeliveryRun: printDeliveryRun };
}

module.exports = { createPrintManager: createPrintManager, normalizeSettings: normalizeSettings, safeFilePart: safeFilePart };
