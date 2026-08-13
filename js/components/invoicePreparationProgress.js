import { Modal } from "./modal.js";

var activeProgress = null;

function getProgressMessage(index) {
    var messages = [
        'Checking for an existing invoice...',
        'Loading order and customer details...',
        'Preparing invoice number and payment QR...',
        'Rendering the printable invoice...'
    ];
    return messages[index % messages.length];
}

function updateProgressMessage(progress) {
    if (!progress) {
        return;
    }
    progress.messageIndex += 1;
    var message = document.getElementById('order-print-progress-message');
    if (message) {
        message.textContent = getProgressMessage(progress.messageIndex);
    }
}

function closeProgress(progress) {
    if (!progress) {
        return;
    }
    if (progress.messageTimer) {
        window.clearInterval(progress.messageTimer);
        progress.messageTimer = null;
    }
    if (progress.closeTimer) {
        window.clearTimeout(progress.closeTimer);
        progress.closeTimer = null;
    }
    progress.modal.close();
    if (activeProgress === progress) {
        activeProgress = null;
    }
}

export function startInvoicePreparationProgress() {
    if (activeProgress) {
        closeProgress(activeProgress);
    }

    var modal = new Modal({
        title: 'Preparing invoice',
        footer: false,
        closeOnBackdrop: false,
        closeOnEsc: true,
        size: 'small',
        content: '<div class="order-print-progress" role="status" aria-live="polite" aria-busy="true">' +
            '<div class="order-print-progress-copy">' +
                '<strong>Please wait while we prepare the printable invoice.</strong>' +
                '<span id="order-print-progress-message">' + getProgressMessage(0) + '</span>' +
            '</div>' +
            '<div id="order-print-progress-track" class="order-print-progress-track" role="progressbar" aria-label="Preparing printable invoice" aria-valuetext="Working">' +
                '<div class="order-print-progress-bar"></div>' +
            '</div>' +
            '<small>You can keep this window open. This may take several seconds.</small>' +
        '</div>'
    });
    modal.open();

    activeProgress = {
        modal: modal,
        messageIndex: 0,
        messageTimer: null,
        closeTimer: null
    };
    activeProgress.messageTimer = window.setInterval(function rotateInvoiceProgressMessage() {
        updateProgressMessage(activeProgress);
    }, 2400);
    return activeProgress;
}

export function finishInvoicePreparationProgress() {
    var progress = activeProgress;
    if (!progress) {
        return;
    }
    if (progress.messageTimer) {
        window.clearInterval(progress.messageTimer);
        progress.messageTimer = null;
    }

    var wrapper = document.querySelector('.order-print-progress');
    var track = document.getElementById('order-print-progress-track');
    var message = document.getElementById('order-print-progress-message');
    if (wrapper) {
        wrapper.classList.add('is-complete');
        wrapper.setAttribute('aria-busy', 'false');
    }
    if (track) {
        track.setAttribute('aria-valuenow', '100');
        track.setAttribute('aria-valuetext', 'Ready');
    }
    if (message) {
        message.textContent = 'Invoice ready.';
    }

    progress.closeTimer = window.setTimeout(function closeCompletedInvoiceProgress() {
        closeProgress(progress);
    }, 220);
}

export function stopInvoicePreparationProgress() {
    closeProgress(activeProgress);
}

export default {
    startInvoicePreparationProgress: startInvoicePreparationProgress,
    finishInvoicePreparationProgress: finishInvoicePreparationProgress,
    stopInvoicePreparationProgress: stopInvoicePreparationProgress
};
