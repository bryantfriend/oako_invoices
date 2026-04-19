import { settingsService } from "./settingsService.js";

const STORE_PIN = '123456';
const DEFAULT_COURIER_PIN = '123456';

function isSixDigitPin(pin) {
    return typeof pin === 'string' && /^\d{6}$/.test(pin);
}

export const pinService = {
    parsePinInput(input = '') {
        const raw = String(input).trim();
        if (raw.startsWith('#')) {
            return { role: 'courier', pin: raw.slice(1) };
        }
        return { role: 'store', pin: raw };
    },

    async authenticate(input, stores = []) {
        const { role, pin } = this.parsePinInput(input);
        if (!isSixDigitPin(pin)) {
            return { ok: false, reason: 'PIN must be 6 digits.' };
        }

        const settings = await settingsService.getInvoiceSettings();

        if (role === 'courier') {
            const courierPin = settings.courierPin || DEFAULT_COURIER_PIN;
            return pin === courierPin
                ? { ok: true, role: 'courier', readOnly: true }
                : { ok: false, reason: 'Invalid courier PIN.' };
        }

        const matchedStore = stores.find(store => store.pin === pin) || null;
        if (pin === STORE_PIN || matchedStore) {
            const store = matchedStore || {
                id: settings.storeId || STORE_PIN,
                name: settings.storeName || 'Store'
            };
            return { ok: true, role: 'store', store, readOnly: false };
        }

        return { ok: false, reason: 'Invalid store PIN.' };
    },

    authenticateInvoice(input, invoice, settings = {}, preferredMode = '') {
        const { role, pin } = this.parsePinInput(input);
        if (!isSixDigitPin(pin)) {
            return { ok: false, reason: 'PIN must be 6 digits.' };
        }

        const courierPin = settings.courierPin || DEFAULT_COURIER_PIN;
        const storePin = invoice?.customerPinCode || invoice?.pinCode || invoice?.storePin || settings.storePin || STORE_PIN;

        if (role === 'courier' || preferredMode === 'courier' || (pin === courierPin && pin !== storePin)) {
            return pin === courierPin
                ? { ok: true, role: 'courier', label: 'Courier' }
                : { ok: false, reason: 'Invalid courier PIN.' };
        }

        return pin === storePin
            ? { ok: true, role: 'store', label: 'Customer' }
            : { ok: false, reason: 'Invalid customer PIN.' };
    },

    canReadInvoice(session, invoice) {
        if (!session?.ok || !invoice) return false;
        if (session.role === 'courier') return true;
        return invoice.storeId === session.store?.id;
    },

    filterInvoicesForSession(session, invoices = []) {
        if (!session?.ok) return [];
        if (session.role === 'courier') return invoices;
        return invoices.filter(invoice => invoice.storeId === session.store?.id);
    }
};
