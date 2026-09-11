import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import * as firestore from 'firebase/firestore';
import { ref, uploadBytes, getBytes } from 'firebase/storage';
import * as invoiceNumbers from '../js/services/invoiceNumberService.js';
import * as constants from '../js/core/constants.js';
import printProcessor from '../js/ICF/Stages/Processors/Invoices/processMarkInvoicePrinted.js';

// Never allow this suite to reach a production Firebase project.
const projectId = 'demo-invoice-rules';
for (const variable of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST']) {
    assert.match(process.env[variable] || '', /^127\.0\.0\.1:\d+$/, variable + ' must point to the local emulator.');
}

const { doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc, serverTimestamp, Timestamp } = firestore;
const roles = ['admin', 'superadmin', 'owner', 'manager', 'super_admin'];
let environment;
const bundles = new Map();

// Keep the actual service implementations. Replace only browser/infrastructure boundaries;
// every Firestore operation uses the real SDK and the emulator's enforced rules.
async function loadService(file, db, uid, extra = {}) {
    if (!bundles.has(file)) {
        const bundle = await build({
            entryPoints: ['js/services/' + file + '.js'], bundle: true, write: false,
            platform: 'node', format: 'cjs', supported: { 'dynamic-import': false },
            plugins: [{
                name: 'firebase-emulator-boundaries',
                setup(api) {
                    api.onResolve({ filter: /.*/ }, function (args) {
                        if (args.kind !== 'entry-point') return { path: args.path, external: true };
                    });
                }
            }]
        });
        bundles.set(file, bundle.outputFiles[0].text);
    }
    const modules = Object.assign({
        firebase: { db, auth: { currentUser: { uid, email: uid + '@example.test' } } },
        'firebase-firestore': firestore,
        invoiceNumberService: invoiceNumbers,
        constants,
        workflowLocalStore: { workflowLocalStore: { preference() { return { fun: false }; } } },
        workflowEffectsService: { queueWorkflowEffect() {} },
        offlineStatusService: { offlineStatusService: { isOnline() { return true; } } },
        store: { store: { getState() { return { isAdmin: true, adminProfile: { role: 'admin' } }; } } }
    }, extra);
    const result = { exports: {} };
    const execute = new Function('require', 'module', 'exports', bundles.get(file));
    execute(function (specifier) { return modules[path.basename(specifier, '.js')] || {}; }, result, result.exports);
    return result.exports;
}

function staffDatabase(role = 'admin') {
    return environment.authenticatedContext('staff-' + role).firestore();
}

function invoicePayload(orderId, productId = 'bread') {
    return {
        orderId, customerName: 'Emulator cafe', storeId: 'KORG', status: 'draft',
        totalAmount: 300, createdAt: Timestamp.fromDate(new Date('2026-09-11T06:00:00Z')),
        invoiceNumber: 'PENDING-' + orderId, workflowCreateRewardEligible: true,
        items: [{ productId, name: 'Bread', quantity: 3, unitPrice: 100 }]
    };
}

before(async function () {
    firestore.setLogLevel('silent'); // Expected permission denials otherwise flood the test report.
    environment = await initializeTestEnvironment({
        projectId,
        firestore: { rules: await readFile('firebase/firestore.rules', 'utf8') },
        storage: { rules: await readFile('firebase/storage.rules', 'utf8') }
    });
    await environment.clearFirestore();
    await environment.withSecurityRulesDisabled(async function (context) {
        const db = context.firestore();
        for (const role of roles) {
            await setDoc(doc(db, 'users', 'staff-' + role), { uid: 'staff-' + role, email: role + '@example.test', role, xp: 0 });
        }
        await setDoc(doc(db, 'users', 'customer'), { uid: 'customer', role: 'customer', email: 'customer@example.test' });
        await setDoc(doc(db, 'customers', 'cafe'), { name: 'Emulator cafe' });
        await setDoc(doc(db, 'products', 'bread'), { name: 'Bread', quantity: 100, price: 100 });
        await setDoc(doc(db, 'orders_archive', 'historical'), { customerName: 'Emulator cafe', items: [] });
    });
});

after(async function () {
    if (environment) await environment.cleanup();
});

for (const role of roles) {
    test(role + ': save, recover, number, print and reward the real invoice services', async function () {
        const uid = 'staff-' + role;
        const db = staffDatabase(role);
        const { dataIntegrityService } = await loadService('dataIntegrityService', db, uid);
        const { orderService } = await loadService('orderService', db, uid, { dataIntegrityService: { dataIntegrityService } });
        const { gamificationService } = await loadService('gamificationService', db, uid);
        await assertSucceeds(getDocs(collection(db, 'customers')));
        await assertSucceeds(getDocs(collection(db, 'orders_archive')));
        const payload = { customerName: 'Emulator cafe', storeId: 'KORG', orderDate: '2026-09-11', items: invoicePayload('').items, totalAmount: 300 };
        const options = { requestId: 'rules-request-' + role, returnRecord: true };
        const order = await orderService.createOrder(payload, uid, options);
        const recovered = await orderService.createOrder(payload, uid, options);
        assert.equal(order.id, recovered.id);
        assert.equal(recovered.workflowReused, true);

        const invoiceOptions = { intentId: 'rules-invoice-' + role, intentType: 'PrepareInvoiceIntent', returnResult: true };
        const invoice = await dataIntegrityService.createInvoiceWithIntegrity(invoicePayload(order.id, role), invoiceOptions);
        const retry = await dataIntegrityService.createInvoiceWithIntegrity(invoicePayload(order.id, role), invoiceOptions);
        assert.equal(invoice.invoiceId, retry.invoiceId);
        assert.equal(retry.alreadyProcessed, true);
        assert.match(invoice.invoiceNumber, /^INV-2026-\d{6}$/);
        const invoiceRef = doc(db, 'invoices', invoice.invoiceId);
        const printed = await printProcessor.processMarkInvoicePrinted({
            payload: { orderId: order.id, invoiceId: invoice.invoiceId },
            context: { order, invoice: invoice.invoice, printApi: {
                updateOrder(id, patch) { return updateDoc(doc(db, 'orders', id), patch); },
                async updateInvoice(id, patch) {
                    const previous = (await getDoc(invoiceRef)).data();
                    return dataIntegrityService.updateInvoiceWithIntegrity(invoiceRef, previous, patch, { action: 'update' });
                },
                awardPrintedInvoice() { return gamificationService.awardWorkflowAction('invoicesPrinted', invoice.invoiceId); }
            } }
        });
        assert.equal(printed.ok, true);
        await gamificationService.awardWorkflowAction('ordersCreated', order.id);
        await gamificationService.awardWorkflowAction('invoicesCreated', invoice.invoiceId);
        const rewardRetry = await gamificationService.awardWorkflowAction('invoicesPrinted', invoice.invoiceId);
        assert.equal(rewardRetry.alreadyProcessed, true);
        assert.equal((await getDoc(invoiceRef)).data().isPrinted, true);
        assert.equal((await getDoc(doc(db, 'orders', order.id))).data().status, 'confirmed');
        const profile = (await getDoc(doc(db, 'users', uid))).data();
        assert.equal(profile.xp, 45);
        assert.equal(profile.actions.invoicesPrinted, 1);
        const inventory = (await getDoc(doc(db, 'inventory', '2026-09-11_' + role))).data();
        assert.equal(inventory.invoiceQuantity, 3);
        assert.equal((await getDoc(doc(db, 'processed_invoice_intents', invoiceOptions.intentId))).exists(), true);
    });
}

test('rewards remain once per invoice when another staff member retries', async function () {
    const db = staffDatabase('manager');
    const receipt = (await getDocs(collection(db, 'workflow_rewards'))).docs.find(function (row) {
        return row.data().action === 'invoicesPrinted' && row.data().actorId === 'staff-admin';
    }).data();
    const { gamificationService } = await loadService('gamificationService', db, 'staff-manager');
    assert.equal((await gamificationService.awardWorkflowAction('invoicesPrinted', receipt.entityId)).alreadyProcessed, true);
    assert.equal((await getDoc(doc(db, 'users', 'staff-manager'))).data().xp, 45);
});

test('anonymous, nonstaff and missing-profile accounts cannot use private invoice workflows', async function () {
    const contexts = [environment.unauthenticatedContext(), environment.authenticatedContext('customer'), environment.authenticatedContext('no-profile')];
    for (const context of contexts) {
        const db = context.firestore();
        for (const name of ['orders', 'invoices', 'invoice_sequences', 'customers', 'orders_archive', 'workflow_rewards', 'inventory', 'audit_logs']) {
            await assertFails(getDocs(collection(db, name)));
        }
        await assertFails(setDoc(doc(db, 'orders', 'unauthorized'), { status: 'draft', workflowRequestId: 'private-save', items: [] }));
        await assertFails(setDoc(doc(db, 'invoices', 'unauthorized'), invoicePayload('unauthorized')));
        await assertFails(setDoc(doc(db, 'workflow_rewards', 'unauthorized'), { actorId: 'customer', action: 'invoicesPrinted', entityId: 'x', createdAt: serverTimestamp() }));
    }
    const db = environment.authenticatedContext('customer').firestore();
    await assertFails(updateDoc(doc(db, 'users', 'customer'), { role: 'admin' }));
    await assertSucceeds(updateDoc(doc(db, 'users', 'customer'), { displayName: 'Customer' }));
    const newDb = environment.authenticatedContext('new-user').firestore();
    await assertSucceeds(setDoc(doc(newDb, 'users', 'new-user'), { uid: 'new-user', email: 'new@example.test', xp: 0 }));
    await assertFails(updateDoc(doc(newDb, 'users', 'new-user'), { role: 'owner' }));
});

test('reward receipts reject mutation, impersonation, invalid actions and extra fields', async function () {
    const db = staffDatabase();
    const receiptRef = (await getDocs(collection(db, 'workflow_rewards'))).docs[0].ref;
    await assertFails(updateDoc(receiptRef, { action: 'ordersCreated' }));
    await assertFails(deleteDoc(receiptRef));
    const valid = { actorId: 'staff-admin', action: 'invoicesPrinted', entityId: 'x', createdAt: serverTimestamp() };
    for (const patch of [{ actorId: 'staff-manager' }, { action: 'freeXp' }, { xp: 1000 }, { createdAt: 'today' }]) {
        await assertFails(setDoc(doc(db, 'workflow_rewards', 'invalid'), Object.assign({}, valid, patch)));
    }
});

test('invoice numbering advances once per create; sequence and financial records cannot be deleted', async function () {
    const db = staffDatabase();
    const sequence = doc(db, 'invoice_sequences', 'global-2026');
    assert.equal((await getDoc(sequence)).data().lastValue, 5);
    await assertFails(updateDoc(sequence, { lastValue: 4 }));
    await assertFails(updateDoc(sequence, { lastValue: 7 }));
    await assertFails(deleteDoc(sequence));
    await assertFails(deleteDoc((await getDocs(collection(db, 'invoices'))).docs[0].ref));
    await assertFails(deleteDoc((await getDocs(collection(db, 'orders'))).docs[0].ref));
    await assertFails(updateDoc((await getDocs(collection(db, 'audit_logs'))).docs[0].ref, { type: 'changed' }));
});

test('public catalog, invoice QR snapshots and one-time customer approvals still work', async function () {
    const staff = staffDatabase();
    const publicDb = environment.unauthenticatedContext().firestore();
    const qr = doc(staff, 'invoice_qr_links', 'fixture-token');
    await assertSucceeds(setDoc(qr, { invoiceId: 'fixture', token: 'fixture-token', invoiceNumber: 'INV-2026-000001', items: [] }));
    await assertSucceeds(getDoc(doc(publicDb, 'invoice_qr_links', 'fixture-token')));
    await assertFails(updateDoc(doc(publicDb, 'invoice_qr_links', 'fixture-token'), { invoiceNumber: 'changed' }));
    await assertSucceeds(getDocs(collection(publicDb, 'products')));
    const approval = doc(staff, 'invoiceApprovalLinks', 'fixture-approval');
    await assertSucceeds(setDoc(approval, {
        invoiceId: 'fixture', token: 'fixture-approval', status: 'pending', createdAt: serverTimestamp(),
        expiresAt: Timestamp.fromMillis(Date.now() + 3600000), invoiceSnapshot: { items: [] }
    }));
    const publicApproval = doc(publicDb, 'invoiceApprovalLinks', 'fixture-approval');
    await assertSucceeds(getDoc(publicApproval));
    await assertFails(getDocs(collection(publicDb, 'invoiceApprovalLinks')));
    await assertSucceeds(updateDoc(publicApproval, { status: 'accepted', responseType: 'accepted', responseSubmittedAt: serverTimestamp() }));
    await assertFails(updateDoc(publicApproval, { status: 'modified', responseType: 'modified', responseSubmittedAt: serverTimestamp() }));
    await assertSucceeds(setDoc(doc(publicDb, 'notifications', 'fixture-response'), { type: 'invoiceApprovalResponse', invoiceId: 'fixture', responseType: 'accepted', createdAt: serverTimestamp() }));
});

test('storage permits invoice PDFs and public brand images, while rejecting wrong types and anonymous uploads', async function () {
    const staff = environment.authenticatedContext('staff-admin').storage();
    const publicStorage = environment.unauthenticatedContext().storage();
    const bytes = new Uint8Array([37, 80, 68, 70]);
    await assertSucceeds(uploadBytes(ref(staff, 'invoices/fixture.pdf'), bytes, { contentType: 'application/pdf' }));
    await assertSucceeds(getBytes(ref(staff, 'invoices/fixture.pdf')));
    await assertFails(getBytes(ref(publicStorage, 'invoices/fixture.pdf')));
    await assertFails(uploadBytes(ref(publicStorage, 'invoices/anonymous.pdf'), bytes, { contentType: 'application/pdf' }));
    await assertFails(uploadBytes(ref(staff, 'invoices/wrong.png'), bytes, { contentType: 'image/png' }));
    for (const folder of ['brand', 'products', 'banners', 'campaigns', 'hamster-spin-images', 'stores/KORG/branding', 'stores/KORG/media/nested']) {
        await assertSucceeds(uploadBytes(ref(staff, folder + '/fixture.png'), bytes, { contentType: 'image/png' }));
        await assertSucceeds(getBytes(ref(publicStorage, folder + '/fixture.png')));
    }
    await assertFails(uploadBytes(ref(staff, 'brand/too-big.png'), new Uint8Array(5 * 1024 * 1024), { contentType: 'image/png' }));
});
