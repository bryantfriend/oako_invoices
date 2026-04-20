import { settingsService } from "./settingsService.js";

const DEFAULT_COURIER_PIN = '23456';

function isSixDigitPin(pin) {
    return typeof pin === 'string' && /^\d{6}$/.test(pin);
}

function normalizeCourierPin(pin) {
    const digits = String(pin || '').replace(/\D/g, '');
    if (/^\d{5}$/.test(digits)) return digits;
    if (/^0\d{5}$/.test(digits)) return digits.slice(1);
    if (/^\d{6}$/.test(digits)) return digits.slice(1);
    return DEFAULT_COURIER_PIN;
}

function isCustomerPin(pin) {
    return /^1\d{5}$/.test(String(pin || ''));
}

export const pinService = {
    parsePinInput(input = '') {
        const raw = String(input).trim();
        if (raw.startsWith('0')) {
            return { role: 'courier', pin: raw };
        }
        if (raw.startsWith('1')) {
            return { role: 'store', pin: raw };
        }
        if (raw.startsWith('#')) {
            return { role: 'courier', pin: `0${raw.slice(1)}` };
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
            const courierPin = normalizeCourierPin(settings.courierPin);
            return pin === `0${courierPin}`
                ? { ok: true, role: 'courier', readOnly: true }
                : { ok: false, reason: 'Invalid courier PIN.' };
        }

        const matchedStore = stores.find(store => store.pin === pin) || null;
        if (matchedStore) {
            return { ok: true, role: 'store', store: matchedStore, readOnly: false };
        }

        return { ok: false, reason: 'Invalid store PIN.' };
    },

    authenticateInvoice(input, invoice, settings = {}, preferredMode = '') {
        const { role, pin } = this.parsePinInput(input);
        if (!isSixDigitPin(pin)) {
            return { ok: false, reason: 'PIN must be 6 digits.' };
        }

        const courierPin = `0${normalizeCourierPin(settings.courierPin)}`;
        const customerPin = invoice?.customerPinCode || invoice?.pinCode || invoice?.storePin || '';

        if (role === 'courier') {
            return pin === courierPin
                ? { ok: true, role: 'courier', label: 'Courier' }
                : { ok: false, reason: 'Invalid courier PIN.' };
        }

        if (!isCustomerPin(customerPin)) {
            return { ok: false, reason: 'This invoice does not have a customer PIN yet. Please ask the office to refresh the invoice QR.' };
        }

        return pin === customerPin
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
