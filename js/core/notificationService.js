class NotificationService {
    constructor() {
        this.container = document.getElementById('toast-container');
    }

    show(message, type = 'info', duration = 3000) {
        if (!this.container) {
            this.container = document.getElementById('toast-container');
        }

        const toast = document.createElement('div');
        toast.className = `toast toast-${type} animate-slide-up`;
        toast.style.cssText = `
            background: ${type === 'error' ? 'var(--color-error)' : 'var(--color-gray-800)'};
            color: white;
            padding: 12px 12px 12px 20px;
            border-radius: var(--radius-md);
            margin-bottom: 12px;
            box-shadow: var(--shadow-lg);
            font-size: 14px;
            font-weight: 500;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            min-width: 300px;
        `;

        const messageEl = document.createElement('span');
        messageEl.textContent = message;

        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.textContent = 'x';
        closeButton.setAttribute('aria-label', 'Close notification');
        closeButton.style.cssText = `
            width: 26px;
            height: 26px;
            border: 1px solid rgba(255,255,255,0.55);
            border-radius: 6px;
            background: rgba(255,255,255,0.12);
            color: white;
            font-size: 16px;
            font-weight: 900;
            line-height: 1;
            cursor: pointer;
            flex: 0 0 auto;
        `;

        function dismissToast() {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            toast.addEventListener('transitionend', function() {
                toast.remove();
            }, { once: true });
            setTimeout(function() {
                if (toast.parentNode) {
                    toast.remove();
                }
            }, 250);
        }

        closeButton.addEventListener('click', dismissToast);
        toast.appendChild(messageEl);
        toast.appendChild(closeButton);

        this.container.appendChild(toast);

        setTimeout(dismissToast, duration);
    }

    success(message) {
        this.show(message, 'success');
    }

    error(message) {
        this.show(message, 'error');
    }

    info(message) {
        this.show(message, 'info');
    }
}

export const notificationService = new NotificationService();
