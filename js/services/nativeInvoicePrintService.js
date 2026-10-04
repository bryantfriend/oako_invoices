import { startPrintWindowLoading, buildOvenWaitingDocument } from '../components/ovenLoading.js';
import { buildInvoicePrintPages } from './invoicePrintTemplate.js';
import { qrService } from './qrService.js';
import { invoiceController } from '../controllers/invoiceController.js';
import { workflowLocalStore } from './workflowLocalStore.js';
import { i18n } from '../core/i18n.js';
import { buildDeliveryDocuments } from './deliveryPrintDocuments.js';

var desktopPrintSequence = 0;

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export function reserveInvoicePrintWindow() {
    desktopPrintSequence += 1;
    var popupName = window.desktopApp ? 'ko-invoice-print-' + Date.now() + '-' + desktopPrintSequence : '_blank';
    var popup = window.open('', popupName, 'width=980,height=850');
    if (!popup)
        throw new Error(
            'Allow pop-ups for this site, then try printing again. Your saved order will be reused.',
        );
    popup.document.write(
        buildOvenWaitingDocument('Preparing printable invoices'),
    );
    popup.document.close();
    return popup;
}

export function buildNativePrintDocument(pages, layout, baseUrl, paperSize) {
    var sizes = {
        a4: [210, 297],
        letter: [215.9, 279.4],
        legal: [215.9, 355.6],
        a3: [297, 420],
        a5: [148, 210],
    };
    var size = sizes[String(paperSize || '').toLowerCase()] || sizes.a4;
    var twoUp = layout === 'two-up-portrait';
    var scale = twoUp ? Math.min(size[0] / 296, size[1] / 2 / 210) : Math.min(size[0] / 210, size[1] / 296);
    var sheets = [];
    for (var index = 0; index < pages.length; index += 1) {
        sheets.push(
            '<section class="print-sheet"><div class="print-slot">' +
                pages[index] +
                '</div>' +
                (twoUp ? '<div class="print-slot">' + pages[index] + '</div>' : '') +
                '</section>',
        );
    }
    return (
        '<!doctype html><html><head><meta charset="utf-8"><base href="' +
        escapeHtml(baseUrl) +
        '"><title>Invoice print job</title><style>' +
        '@page{size:' +
        size[0] +
        'mm ' +
        size[1] +
        'mm;margin:0}*{box-sizing:border-box}body{margin:0;background:#e8eee6;font-family:Arial,sans-serif}' +
        '.print-toolbar{position:sticky;top:0;z-index:10;background:#193c2a;color:white;padding:14px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}.print-toolbar button{font:inherit;padding:10px 16px;border:0;border-radius:8px;cursor:pointer}.print-toolbar button:disabled{opacity:.55;cursor:wait}' +
        '.print-sheet{width:' +
        size[0] +
        'mm;height:' +
        size[1] +
        'mm;background:white;margin:14px auto;break-after:page;page-break-after:always;overflow:hidden}.print-sheet:last-child{break-after:auto;page-break-after:auto}' +
        // Containment prevents the rotated page's original height from being
        // fragmented at the physical page boundary inside the lower copy.
        '.print-slot{contain:strict;width:100%;height:' +
        (twoUp ? '50%' : '100%') +
        ';position:relative;overflow:hidden}.print-slot+.print-slot{border-top:1px dashed #aaa}' +
        '.invoice-page{display:block!important;position:absolute!important;top:0!important;left:0!important;width:210mm!important;height:296mm!important;margin:0!important;box-shadow:none!important;transform-origin:0 0!important;transform:' +
        (twoUp
            ? 'translateX(' + size[0] + 'mm) rotate(90deg) scale(' + scale + ')'
            : 'scale(' + scale + ')') +
        '!important}' +
        '@media print{body{background:white}.print-toolbar{display:none}.print-sheet{margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body>' +
        '<nav class="print-toolbar"><button id="job-print" disabled>Print invoices</button><button id="job-confirm" disabled>Paper printed successfully</button><span id="job-status" role="status">Loading images…</span></nav>' +
        sheets.join('') +
        '</body></html>'
    );
}

async function waitForPrintAssets(popup) {
    var images = Array.from(popup.document.images);
    await Promise.all(
        images.map(function (image) {
            if (image.complete) {
                if (image.naturalWidth > 0) return Promise.resolve();
                return Promise.reject(
                    new Error('An invoice image could not load. Reopen the print preview to retry.'),
                );
            }
            return new Promise(function (resolve, reject) {
                var timer = setTimeout(function () {
                    reject(new Error('An invoice image timed out. Reopen the print preview to retry.'));
                }, 15000);
                image.onload = function () {
                    clearTimeout(timer);
                    resolve();
                };
                image.onerror = function () {
                    clearTimeout(timer);
                    reject(new Error('An invoice image failed to load.'));
                };
            });
        }),
    );
    if (popup.document.fonts) await popup.document.fonts.ready;
    await new Promise(function(resolve) {
        popup.requestAnimationFrame(function() { popup.requestAnimationFrame(resolve); });
    });
}

export async function showNativeInvoicePrint(popup, invoices, settings, options) {
    var ovenProgress = startPrintWindowLoading(popup, 'Preparing printable invoices');
    var safeOptions = options || {};
    var started = Date.now();
    var pages = [];
    var records = [];
    try {
        var desktopProfile = window.desktopApp ? await window.desktopApp.getPrintSettings() : null;
        for (var index = 0; index < invoices.length; index += 1) {
            var invoice = Object.assign({}, invoices[index]);
            if (!invoice.secureToken) invoice = await qrService.ensureInvoiceToken(invoice);
            if (!invoice.invoiceQrDataUrl) invoice.invoiceQrDataUrl = await qrService.generateQrDataUrl(invoice, 300);
            records.push(invoice);
            ovenProgress.update((index + 1) / invoices.length * 80, 'Preparing invoice ' + (index + 1) + ' of ' + invoices.length);
            pages = pages.concat(
                buildInvoicePrintPages({
                    invoice: invoice,
                    settings: settings,
                    language: i18n.getLanguage(),
                    showAllPages: true,
                }),
            );
        }
        if (!pages.length) throw new Error('There are no invoices to print.');
        if (popup.closed) throw new Error('Print preview was closed. Reopen it to continue.');
        popup.document.open();
        popup.document.write(
            buildNativePrintDocument(
                pages,
                safeOptions.layout || 'full',
                new URL('.', document.baseURI).href,
                desktopProfile ? desktopProfile.paperSize : settings.printPaperSize || settings.paperSize,
            ),
        );
        popup.document.close();
        await waitForPrintAssets(popup);
        ovenProgress.finish();
        var printButton = popup.document.getElementById('job-print');
        var confirmButton = popup.document.getElementById('job-confirm');
        var status = popup.document.getElementById('job-status');
        if (safeOptions.skippedInvoices && safeOptions.skippedInvoices.length) {
            var skipped = popup.document.createElement('span');
            skipped.textContent = 'Skipped invoices: ' + safeOptions.skippedInvoices.join('; ');
            status.parentNode.appendChild(skipped);
        }
        var confirmedIds = new Set();
        var printedAttempts = 0;
        var nativePayload = {
            windowName: popup.name,
            label: records.length === 1 ? String(records[0].customerName || 'customer') + '-' + String(records[0].invoiceNumber || records[0].id || 'invoice') : 'invoice-batch-' + records.length
        };
        nativePayload.label = nativePayload.label.slice(0, 250);
        async function printJob() {
            printButton.disabled = true;
            try {
                var submitted = null;
                if (window.desktopApp) {
                    status.textContent = 'Sending invoices to Windows…';
                    submitted = await window.runDesktopPrintAction('print', nativePayload);
                } else {
                    popup.focus();
                    popup.print();
                }
                printedAttempts += 1;
                if (
                    printedAttempts > 1 ||
                    records.some(function (record) {
                        return record.isPrinted;
                    })
                )
                    workflowLocalStore.event('reprint', { count: records.length });
                confirmButton.disabled = false;
                status.textContent =
                    'Confirm only after checking the paper. Cancelled printing stays unconfirmed.';
                if (submitted && submitted.filedPath) status.textContent += ' PDF saved: ' + submitted.filedPath;
                if (submitted && submitted.filingError) status.textContent += ' ' + submitted.filingError + ' Use Save PDF to retry.';
            } catch (error) {
                status.textContent = error.message + ' No new paper confirmation was recorded.';
            } finally {
                printButton.disabled = false;
            }
        }
        if (window.desktopApp) {
            var deliveryButton = popup.document.createElement('button');
            deliveryButton.textContent = 'Print delivery run';
            status.parentNode.insertBefore(deliveryButton, status);
            var companions = null;
            deliveryButton.onclick = async function printDeliveryRun() {
                deliveryButton.disabled = true;
                printButton.disabled = true;
                try {
                    if (!companions) {
                        var profile = await window.desktopApp.getPrintSettings();
                        if (!profile.deviceName) throw new Error('Choose an invoice printer in Settings before printing a delivery run.');
                        var documents = buildDeliveryDocuments(records, profile);
                        companions = [];
                        for (var type of ['packing', 'labels']) {
                            var companion = reserveInvoicePrintWindow();
                            companions.push({ type: type, popup: companion });
                            companion.document.open(); companion.document.write(documents[type]); companion.document.close();
                            await waitForPrintAssets(companion);
                        }
                    }
                    var result = await window.runDesktopPrintAction('deliveryRun', {
                        windowName: popup.name, label: nativePayload.label,
                        documents: [{ type: 'invoice', windowName: popup.name }].concat(companions.map(function(document) { return { type: document.type, windowName: document.popup.name }; }))
                    });
                    if (result.submitted.indexOf('invoice') !== -1) confirmButton.disabled = false;
                    status.textContent = 'Sent to Windows: ' + result.submitted.join(', ') + '. Check the paper before confirming.';
                    if (result.failures.length) status.textContent += ' ' + result.failures.map(function(failure) { return failure.type + ': ' + failure.message; }).join('; ') + '. Retry sends only documents that have not been submitted.';
                    deliveryButton.textContent = result.complete ? 'Delivery run submitted ✓' : 'Retry delivery run';
                    deliveryButton.disabled = result.complete;
                } catch (error) {
                    status.textContent = error.message;
                    if (companions && companions.some(function(document) { return document.popup.closed; })) companions = null;
                    deliveryButton.disabled = false;
                } finally { printButton.disabled = false; }
            };
            var fileButton = popup.document.createElement('button');
            fileButton.textContent = 'Save PDF';
            status.parentNode.insertBefore(fileButton, status);
            fileButton.onclick = async function fileInvoices() {
                fileButton.disabled = true;
                printButton.disabled = true;
                try {
                    var filed = await window.runDesktopPrintAction('file', nativePayload);
                    status.textContent = 'PDF saved: ' + filed.filedPath + '. Paper confirmation is still required after printing.';
                } catch (error) { status.textContent = error.message; }
                finally { fileButton.disabled = false; printButton.disabled = false; }
            };
        }
        printButton.disabled = false;
        printButton.onclick = printJob;
        confirmButton.onclick = async function confirmPrintedInvoices() {
            var confirmationProgress = startPrintWindowLoading(popup, 'Recording printed invoices');
            confirmButton.disabled = true;
            printButton.disabled = true;
            try {
                for (var recordIndex = 0; recordIndex < records.length; recordIndex += 1) {
                    var record = records[recordIndex];
                    if (confirmedIds.has(record.id)) continue;
                    status.textContent = 'Recording ' + (recordIndex + 1) + ' of ' + records.length + '…';
                    confirmationProgress.update(recordIndex / records.length * 100, status.textContent);
                    var result = await invoiceController.markPrinted(record.id, record.orderId, {
                        invoice: record,
                    });
                    if (!result)
                        throw new Error(
                            'Print status could not be saved. Retry this confirmation; do not print again.',
                        );
                    confirmedIds.add(record.id);
                }
                status.textContent = 'All invoices recorded. Ready for the next customer.';
                confirmButton.textContent = 'Printed ✓';
                if (safeOptions.onConfirmed) await safeOptions.onConfirmed();
            } catch (error) {
                status.textContent = error.message;
                confirmButton.textContent = 'Retry saving print status';
                confirmButton.disabled = false;
                confirmationProgress.fail();
            } finally {
                confirmationProgress.finish();
            }
        };
        status.textContent = records.length + ' invoice(s) ready. Check your layout before printing.';
        workflowLocalStore.event('native_print_ready', {
            durationMs: Date.now() - started,
            count: records.length,
        });
        if (safeOptions.deliveryRun === true && deliveryButton) await deliveryButton.onclick();
        else if (safeOptions.autoPrint !== false) await printJob();
        return { pageCount: pages.length, durationMs: Date.now() - started };
    } catch (error) {
        ovenProgress.fail();
        if (popup && !popup.closed)
            popup.document.body.innerHTML =
                '<main style="font:18px system-ui;padding:40px"><h1>Preview needs attention</h1><p>' +
                escapeHtml(error.message) +
                '</p><p>Your saved orders can be reopened from the editor or daily batch.</p></main>';
        throw error;
    }
}
