const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

async function seed() {
    const signup = await fetch('http://127.0.0.1:9096/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'desktop-test@example.test', password: 'emulator-test-only', returnSecureToken: true }) });
    const user = await signup.json();
    if (!user.localId) throw new Error('Test user could not be created.');
    const records = {
        ['users/' + user.localId]: { role: 'admin', email: 'desktop-test@example.test' },
        'customers/test-customer': { companyName: 'Desktop Test Customer', pinCode: '123456', category: 'A', archived: false },
        'products/test-bread': { name: 'Desktop Test Bread', price: 50, categoryId: 'bread', active: true },
        'categories/bread': { name: 'Bread' },
        'orders/test-order': { customerName: 'Desktop Test Customer', customerId: 'test-customer', status: 'confirmed', archived: false, totalAmount: 100, orderDate: new Date().toISOString().slice(0, 10), items: [{ productId: 'test-bread', name: 'Desktop Test Bread', quantity: 2, price: 50 }] },
        'invoices/test-invoice': { invoiceNumber: 'DESKTOP-TEST-1', orderId: 'test-order', customerName: 'Desktop Test Customer', status: 'confirmed', archived: false, totalAmount: 100, secureToken: 'emulator-only-qr-token', items: [{ productId: 'test-bread', name: 'Desktop Test Bread', quantity: 2, price: 50 }] },
        'settings/invoice_config': { companyName: 'Test Bakery', paperSize: 'a4' },
        'settings/offline_health': { enabled: true }
    };
    function field(value) {
        if (typeof value === 'string') return { stringValue: value };
        if (typeof value === 'boolean') return { booleanValue: value };
        if (typeof value === 'number') return { integerValue: String(value) };
        if (Array.isArray(value)) return { arrayValue: { values: value.map(field) } };
        return { mapValue: { fields: fields(value) } };
    }
    function fields(record) {
        const result = {};
        for (const key of Object.keys(record)) result[key] = field(record[key]);
        return result;
    }
    for (const key of Object.keys(records)) {
        const response = await fetch('http://127.0.0.1:8086/v1/projects/demo-desktop-invoices/databases/(default)/documents/' + key, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' }, body: JSON.stringify({ fields: fields(records[key]) }) });
        if (!response.ok) throw new Error('Could not seed emulator: ' + response.status);
    }
    // Removing only this verified, disposable test profile gives a genuine first installation.
    const directory = path.resolve(__dirname, '../.workbox/desktop-integration/profile');
    const expected = path.resolve(__dirname, '../.workbox/desktop-integration');
    if (!directory.startsWith(expected + path.sep)) throw new Error('Invalid test profile.');
    fs.rmSync(directory, { recursive: true, force: true });
    const result = spawnSync(path.resolve(__dirname, '../desktop/node_modules/electron/dist/electron.exe'), ['desktop', '--desktop-integration'], { cwd: path.resolve(__dirname, '..'), stdio: 'inherit', windowsHide: true });
    if (result.error) throw result.error;
    process.exitCode = result.status || 0;
}
seed().catch(function failed(error) { console.error(error); process.exitCode = 1; });
