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
            padding: 12px 24px;
            border-radius: var(--radius-md);
            margin-bottom: 12px;
            box-shadow: var(--shadow-lg);
            font-size: 14px;
            font-weight: 500;
            display: flex;
            align-items: center;
            justify-content: space-between;
            min-width: 300px;
        `;

        toast.textContent = message;

        this.container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            toast.addEventListener('transitionend', () => {
                toast.remove();
            });
        }, duration);
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
