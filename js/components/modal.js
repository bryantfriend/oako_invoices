import { t } from "../core/i18n.js";
import { notificationService } from "../core/notificationService.js";

export class Modal {
    constructor({
        title = '',
        content = '',
        onConfirm = null,
        confirmText = t('btn_confirm') || 'Confirm',
        cancelText = t('btn_cancel') || 'Cancel',
        type = 'primary', // primary | destructive
        size = 'medium',  // small | medium | large | xlarge
        footer = true,
        closeOnBackdrop = true,
        closeOnEsc = true
    }) {
        this.title = title;
        this.content = content;
        this.onConfirm = onConfirm;
        this.confirmText = confirmText;
        this.cancelText = cancelText;
        this.type = type;
        this.size = size;
        this.footer = footer;
        this.closeOnBackdrop = closeOnBackdrop;
        this.closeOnEsc = closeOnEsc;

        this.container = document.getElementById('modal-container');
        this.modalEl = null;

        this.handleEsc = this.handleEsc.bind(this);
    }

    /* =========================
       PUBLIC API
    ========================= */

    open() {
        this.render();
        if (this.closeOnEsc) {
            document.addEventListener('keydown', this.handleEsc);
        }
    }

    close() {
        if (this.modalEl) {
            this.modalEl.remove();
            this.modalEl = null;
        }
        document.removeEventListener('keydown', this.handleEsc);
    }

    /* =========================
       RENDER
    ========================= */

    render() {
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop animate-fade-in';
        backdrop.style.cssText = `
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
        `;

        const btnClass = this.type === 'destructive' ? 'btn-destructive' : 'btn-primary';
        const sizeMap = {
            small: '400px',
            medium: '600px',
            large: '900px',
            xlarge: '1200px'
        };
        const maxWidth = sizeMap[this.size] || sizeMap.medium;

        backdrop.innerHTML = `
            <div class="modal-content animate-slide-up" style="
                background: white;
                border-radius: var(--radius-lg);
                padding: var(--space-6);
                width: 95%;
                max-width: ${maxWidth};
                max-height: 90vh;
                display: flex;
                flex-direction: column;
                box-shadow: var(--shadow-lg);
            ">
                <h3 style="margin-bottom: var(--space-4); font-size: var(--text-lg); flex-shrink: 0;">
                    ${this.title}
                </h3>

                <div class="modal-body" style="margin-bottom: var(--space-6); overflow-y: auto; flex: 1;">
                    ${this.content}
                </div>

                ${this.footer ? `<div style="display: flex; justify-content: flex-end; gap: var(--space-2); flex-shrink: 0;">
                    <button class="btn btn-secondary cancel-btn">
                        ${this.cancelText}
                    </button>
                    <button class="btn ${btnClass} confirm-btn">
                        ${this.confirmText}
                    </button>
                </div>` : ''}
            </div>
        `;

        // Events
        backdrop.querySelector('.cancel-btn')
            ?.addEventListener('click', () => this.close());

        backdrop.querySelector('.confirm-btn')
            ?.addEventListener('click', async () => {
                try {
                    if (this.onConfirm) {
                        const result = await this.onConfirm();
                        if (result === false) return; // keep modal open
                    }
                    this.close();
                } catch (error) {
                    console.error("Modal confirm action failed:", error);
                    notificationService.error(t('msg_update_fail') || 'Action failed.');
                }
                });

        if (this.closeOnBackdrop) {
            backdrop.addEventListener('click', (e) => {
                if (e.target === backdrop) this.close();
            });
        }

        this.modalEl = backdrop;
        this.container.appendChild(backdrop);
    }

    /* =========================
       ESC HANDLER
    ========================= */

    handleEsc(e) {
        if (e.key === 'Escape') {
            this.close();
        }
    }

    /* =========================
       STATIC HELPERS
    ========================= */

    static alert(title, message) {
        const modal = new Modal({
            title,
            content: `<p>${message}</p>`,
            confirmText: t('btn_ok') || 'OK',
            cancelText: '',
            onConfirm: null
        });
        modal.open();
    }

    static confirm(title, message, onConfirm) {
        const modal = new Modal({
            title,
            content: `<p>${message}</p>`,
            confirmText: t('btn_confirm') || 'Confirm',
            type: 'destructive',
            onConfirm
        });
        modal.open();
    }
}
