import sessionDataStore from "./sessionDataStore.js";
import { invoiceService } from "./invoiceService.js";
import { qrService } from "./qrService.js";
import { buildInvoicePrintPages } from "./invoicePrintTemplate.js";

var generationActive = false;
var activeOperationId = 0;

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function emitProgress(options, completed, total, message, invoiceNumber) {
    if (options && typeof options.onProgress === 'function') {
        options.onProgress({
            completed: completed,
            total: total,
            message: message,
            invoiceNumber: invoiceNumber || ''
        });
    }
}

function getPaperFormat(settings) {
    var value = String(settings && (settings.printPaperSize || settings.paperSize) ? (settings.printPaperSize || settings.paperSize) : 'a4').toLowerCase();
    if (value === 'letter' || value === 'legal' || value === 'a3' || value === 'a5') {
        return value;
    }
    return 'a4';
}

function createPdf(settings, filename) {
    if (!window.jspdf || typeof window.jspdf.jsPDF !== 'function') {
        throw new Error('The local PDF renderer is not available.');
    }
    var pdf = new window.jspdf.jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: getPaperFormat(settings),
        compress: true,
        putOnlyUsedFonts: true
    });
    pdf.setProperties({
        title: filename,
        subject: 'Kyrgyz Organics combined invoice print job',
        creator: 'Kyrgyz Organics Invoice Program'
    });
    return pdf;
}

function getPageSize(pdf) {
    return {
        width: pdf.internal.pageSize.getWidth(),
        height: pdf.internal.pageSize.getHeight()
    };
}

function waitForImage(image) {
    if (image.complete && image.naturalWidth > 0) {
        if (typeof image.decode === 'function') {
            return image.decode().catch(function() {
                return undefined;
            });
        }
        return Promise.resolve();
    }
    return new Promise(function(resolve, reject) {
        var timeoutId = setTimeout(function() {
            reject(new Error('An invoice image did not finish loading.'));
        }, 20000);
        image.addEventListener('load', function() {
            clearTimeout(timeoutId);
            resolve();
        }, { once: true });
        image.addEventListener('error', function() {
            clearTimeout(timeoutId);
            reject(new Error('An invoice image failed to load.'));
        }, { once: true });
    });
}

async function waitForAssets(container) {
    var images = Array.prototype.slice.call(container.querySelectorAll('img'));
    var index = 0;
    while (index < images.length) {
        await waitForImage(images[index]);
        index = index + 1;
    }
    if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
    }
    await new Promise(function(resolve) {
        requestAnimationFrame(function() {
            requestAnimationFrame(resolve);
        });
    });
}

function createRenderHost(pageHtml) {
    var host = document.createElement('div');
    host.className = 'bulk-invoice-render-host';
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText = 'position:fixed;left:-12000px;top:0;width:210mm;height:296mm;overflow:hidden;background:#fff;z-index:-1;pointer-events:none;';
    host.innerHTML = pageHtml;
    var page = host.querySelector('.invoice-page');
    if (!page) {
        throw new Error('Invoice print template returned no page.');
    }
    page.style.display = 'block';
    page.style.position = 'relative';
    page.style.top = '0';
    page.style.transform = 'none';
    document.body.appendChild(host);
    return {
        host: host,
        page: page
    };
}

async function capturePage(pageHtml) {
    if (typeof window.html2canvas !== 'function') {
        throw new Error('The local invoice capture renderer is not available.');
    }
    var mounted = createRenderHost(pageHtml);
    try {
        await waitForAssets(mounted.host);
        var qrImage = mounted.host.querySelector('.invoice-qr-image');
        if (!qrImage || !qrImage.complete || qrImage.naturalWidth < 40) {
            throw new Error('The invoice QR image is missing or blank.');
        }
        return await window.html2canvas(mounted.page, {
            backgroundColor: '#ffffff',
            scale: 2,
            useCORS: true,
            allowTaint: false,
            logging: false,
            imageTimeout: 20000,
            width: mounted.page.scrollWidth,
            height: mounted.page.scrollHeight,
            windowWidth: mounted.page.scrollWidth,
            windowHeight: mounted.page.scrollHeight
        });
    } finally {
        mounted.host.remove();
    }
}

function addFullPage(pdf, canvas, hasPage) {
    if (hasPage) {
        pdf.addPage();
    }
    var size = getPageSize(pdf);
    pdf.addImage(canvas, 'JPEG', 0, 0, size.width, size.height, undefined, 'MEDIUM');
}

function createRotatedHalfCanvas(sourceCanvas) {
    var halfCanvas = document.createElement('canvas');
    halfCanvas.width = sourceCanvas.height;
    halfCanvas.height = sourceCanvas.width;
    var context = halfCanvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, halfCanvas.width, halfCanvas.height);
    context.translate(halfCanvas.width, 0);
    context.rotate(Math.PI / 2);
    context.drawImage(sourceCanvas, 0, 0);
    return halfCanvas;
}

function addTwoUpSheet(pdf, firstCanvas, secondCanvas, hasPage) {
    if (hasPage) {
        pdf.addPage();
    }
    var size = getPageSize(pdf);
    var halfHeight = size.height / 2;
    var firstHalf = createRotatedHalfCanvas(firstCanvas);
    pdf.addImage(firstHalf, 'JPEG', 0, 0, size.width, halfHeight, undefined, 'MEDIUM');
    if (secondCanvas) {
        var secondHalf = createRotatedHalfCanvas(secondCanvas);
        pdf.addImage(secondHalf, 'JPEG', 0, halfHeight, size.width, halfHeight, undefined, 'MEDIUM');
    }
    pdf.setDrawColor(220, 226, 218);
    pdf.setLineDashPattern([2, 2], 0);
    pdf.line(0, halfHeight, size.width, halfHeight);
}

function yieldToBrowser() {
    return new Promise(function(resolve) {
        setTimeout(resolve, 0);
    });
}

function getInvoiceLabel(invoice) {
    return String(invoice && (invoice.invoiceNumber || invoice.id) ? (invoice.invoiceNumber || invoice.id) : 'Unknown invoice');
}

function validateInvoice(invoice, orderId) {
    if (!invoice) {
        throw new Error('Order ' + orderId + ' has no printable invoice.');
    }
    if (!invoice.id || !invoice.invoiceNumber || !Array.isArray(invoice.items)) {
        throw new Error('Invoice ' + getInvoiceLabel(invoice) + ' is missing required printable data.');
    }
}

async function loadPrintableInvoices(orderIds) {
    var snapshot = sessionDataStore.getInvoicesSnapshot();
    var cachedInvoices = snapshot && Array.isArray(snapshot.records)
        ? snapshot.records
        : sessionDataStore.getKnownInvoiceRecords();
    var byOrderId = {};
    var index = 0;
    while (index < cachedInvoices.length) {
        if (cachedInvoices[index] && cachedInvoices[index].orderId) {
            byOrderId[cachedInvoices[index].orderId] = cachedInvoices[index];
        }
        index = index + 1;
    }

    var missingOrderIds = orderIds.filter(function(orderId) {
        return !byOrderId[orderId];
    });
    if (missingOrderIds.length > 0) {
        var loadedInvoices = await invoiceService.getInvoicesByOrderIds(missingOrderIds);
        index = 0;
        while (index < loadedInvoices.length) {
            if (loadedInvoices[index] && loadedInvoices[index].orderId) {
                byOrderId[loadedInvoices[index].orderId] = loadedInvoices[index];
                sessionDataStore.updateInvoiceRecord(loadedInvoices[index].id, loadedInvoices[index], 'bulk-print-load');
            }
            index = index + 1;
        }
    }

    return orderIds.map(function(orderId) {
        return byOrderId[orderId] || null;
    });
}

async function prepareInvoiceQr(invoice) {
    var preparedInvoice = invoice;
    if (!preparedInvoice.secureToken) {
        preparedInvoice = await qrService.ensureInvoiceToken(preparedInvoice);
    }
    preparedInvoice.invoiceQrDataUrl = await qrService.generateQrDataUrl(preparedInvoice, 300);
    if (!preparedInvoice.invoiceQrDataUrl) {
        throw new Error('Invoice ' + getInvoiceLabel(preparedInvoice) + ' QR generation failed.');
    }
    return preparedInvoice;
}

function buildFilename(count, layout) {
    var date = new Date().toISOString().slice(0, 10);
    var suffix = layout === 'two-up-portrait' ? '2-Up-Portrait' : 'Full';
    return 'Kyrgyz-Organics-Invoices-' + date + '-' + count + '-' + suffix + '.pdf';
}

function openPdfBlob(pdf, filename, previewWindow) {
    var blob = pdf.output('blob');
    var namedBlob = typeof File === 'function'
        ? new File([blob], filename, { type: 'application/pdf' })
        : blob;
    var blobUrl = URL.createObjectURL(namedBlob);
    if (!previewWindow || previewWindow.closed) {
        URL.revokeObjectURL(blobUrl);
        throw new Error('The print-preview tab was closed before the PDF was ready.');
    }
    previewWindow.document.title = filename;
    previewWindow.location.replace(blobUrl);
    setTimeout(function() {
        URL.revokeObjectURL(blobUrl);
    }, 300000);
    return {
        blob: blob,
        filename: filename,
        url: blobUrl
    };
}

async function generateCombinedPdf(orderIds, layout, context, options) {
    if (generationActive) {
        throw new Error('Another combined invoice PDF is already being prepared.');
    }
    generationActive = true;
    activeOperationId = activeOperationId + 1;
    var operationId = activeOperationId;
    var failedInvoices = [];
    var startedAt = Date.now();

    try {
        var invoices = await loadPrintableInvoices(orderIds);
        var validationIndex = 0;
        while (validationIndex < invoices.length) {
            try {
                validateInvoice(invoices[validationIndex], orderIds[validationIndex]);
            } catch (validationError) {
                failedInvoices.push(getInvoiceLabel(invoices[validationIndex]) + ': ' + validationError.message);
            }
            validationIndex = validationIndex + 1;
        }
        if (failedInvoices.length > 0) {
            throw new Error('Could not print: ' + failedInvoices.join('; '));
        }

        var settings = context && context.settings ? context.settings : {};
        var filename = buildFilename(invoices.length, layout);
        var pdf = createPdf(settings, filename);
        var hasPdfPage = false;
        var pendingHalf = null;
        var completedInvoices = 0;
        var invoiceIndex = 0;

        while (invoiceIndex < invoices.length) {
            if (operationId !== activeOperationId) {
                throw new Error('This combined print operation is stale.');
            }
            var invoice = invoices[invoiceIndex];
            emitProgress(options, completedInvoices, invoices.length, 'Generating invoice and QR code', getInvoiceLabel(invoice));
            try {
                invoice = await prepareInvoiceQr(invoice);
                var pages = buildInvoicePrintPages({
                    invoice: invoice,
                    settings: settings,
                    language: context && context.language ? context.language : 'en',
                    currentPage: 1,
                    scale: 1,
                    showAllPages: true
                });
                var pageIndex = 0;
                while (pageIndex < pages.length) {
                    var canvas = await capturePage(pages[pageIndex]);
                    if (layout === 'two-up-portrait') {
                        if (!pendingHalf) {
                            pendingHalf = canvas;
                        } else {
                            addTwoUpSheet(pdf, pendingHalf, canvas, hasPdfPage);
                            hasPdfPage = true;
                            pendingHalf = null;
                        }
                    } else {
                        addFullPage(pdf, canvas, hasPdfPage);
                        hasPdfPage = true;
                    }
                    pageIndex = pageIndex + 1;
                    await yieldToBrowser();
                }
            } catch (invoiceError) {
                failedInvoices.push(getInvoiceLabel(invoice) + ': ' + invoiceError.message);
                throw invoiceError;
            }
            completedInvoices = completedInvoices + 1;
            emitProgress(options, completedInvoices, invoices.length, 'Invoice added to combined PDF', getInvoiceLabel(invoice));
            invoiceIndex = invoiceIndex + 1;
        }

        if (layout === 'two-up-portrait' && pendingHalf) {
            addTwoUpSheet(pdf, pendingHalf, null, hasPdfPage);
            hasPdfPage = true;
        }
        if (!hasPdfPage) {
            throw new Error('No printable invoice pages were generated.');
        }

        var opened = openPdfBlob(pdf, filename, options ? options.previewWindow : null);
        console.info('[BULK_PRINT] completed', {
            invoiceCount: invoices.length,
            layout: layout,
            durationMs: Date.now() - startedAt,
            failureStage: ''
        });
        return Object.assign({}, opened, {
            invoiceCount: invoices.length,
            layout: layout,
            durationMs: Date.now() - startedAt
        });
    } catch (error) {
        console.error('[BULK_PRINT] failed', {
            invoiceCount: orderIds.length,
            layout: layout,
            durationMs: Date.now() - startedAt,
            failureStage: error && error.message ? error.message : 'unknown',
            failedInvoices: failedInvoices
        });
        if (options && options.previewWindow && !options.previewWindow.closed) {
            options.previewWindow.document.body.innerHTML = '<main style="font-family:Arial,sans-serif;max-width:720px;margin:60px auto;padding:24px;"><h1 style="color:#991b1b;">Combined PDF preparation failed</h1><p>' + escapeHtml(error.message) + '</p><p>No invoice was silently omitted. Return to the Orders tab, correct the listed invoice, and try again.</p></main>';
        }
        error.failedInvoices = failedInvoices;
        throw error;
    } finally {
        generationActive = false;
    }
}

function isGenerationActive() {
    return generationActive;
}

export const bulkInvoicePrintService = {
    generateCombinedPdf: generateCombinedPdf,
    loadPrintableInvoices: loadPrintableInvoices,
    isGenerationActive: isGenerationActive,
    buildFilename: buildFilename
};

export default bulkInvoicePrintService;
