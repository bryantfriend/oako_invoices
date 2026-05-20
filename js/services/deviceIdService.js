import { getRecord, putRecord } from "./offlineDbService.js";

function randomToken(length) {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = new Uint8Array(length);
    window.crypto.getRandomValues(bytes);

    let value = '';
    for (let index = 0; index < bytes.length; index += 1) {
        value += alphabet[bytes[index] % alphabet.length];
    }
    return value;
}

function sanitizeStoreId(value) {
    const normalized = String(value || 'KORG')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '')
        .slice(0, 12);
    return normalized || 'KORG';
}

function padCounter(value) {
    return String(value).padStart(4, '0');
}

export const deviceIdService = {
    async getDeviceId() {
        const existing = await getRecord('metadata', 'deviceId').catch(function() {
            return null;
        });

        if (existing && existing.value) {
            return existing.value;
        }

        const nextDeviceId = 'D' + randomToken(8);
        await putRecord('metadata', {
            key: 'deviceId',
            value: nextDeviceId,
            createdAtLocal: new Date().toISOString()
        });
        return nextDeviceId;
    },

    async createOfflineEntityId(storeId) {
        const deviceId = await this.getDeviceId();
        const timestamp = new Date().toISOString().replace(/[^0-9]/g, '');
        return sanitizeStoreId(storeId) + '-' + deviceId + '-' + timestamp + '-' + randomToken(6);
    },

    async nextOfflineInvoiceNumber() {
        const record = await getRecord('metadata', 'offlineInvoiceCounter').catch(function() {
            return null;
        });
        const nextValue = record && record.value ? Number(record.value) + 1 : 1;

        await putRecord('metadata', {
            key: 'offlineInvoiceCounter',
            value: nextValue,
            updatedAtLocal: new Date().toISOString()
        });

        return 'OFFLINE-' + padCounter(nextValue);
    }
};
