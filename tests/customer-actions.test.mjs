import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import pipeline from '../js/ICF/engine/pipeline.js';
const registries = {};
for (const [folder, registry, name] of [
    ['Validators', 'validators', 'validateCustomerMutation'],
    ['Normalizers', 'normalizers', 'normalizeCustomerMutation'],
    ['ContextProviders', 'contextProviders', 'addCustomerMutationContext'],
    ['Authorizers', 'authorizers', 'authorizeCustomerMutation'],
    ['Processors', 'processors', 'processCustomerMutation'],
    ['Emitters', 'emitters', 'emitCustomerMutation']
]) {
    registries[registry] = (await import('../js/ICF/Stages/' + folder + '/Customers/' + name + '.js')).default;
}
function loadIntent(name) {
    const source = fs.readFileSync('js/ICF/Intents/' + name + '.js', 'utf8').replace(/^import .*;\r?\n/gm, '').replace('export default', 'var exported =');
    const context = vm.createContext(Object.assign({}, registries));
    vm.runInContext(source, context);
    return context.exported;
}
const update = loadIntent('UpdateCustomerIntent');
const archive = loadIntent('ArchiveCustomerIntent');

function payload(overrides = {}) {
    return Object.assign({
        customerId: 'customer-1', data: { name: ' Updated ' },
        state: { getState: function() { return { isAdmin: true, currentUser: { uid: 'staff' }, adminProfile: { role: 'manager' } }; } },
        customerApi: { updateCustomer: async function() {}, deleteCustomer: async function() {} },
        rewards: { awardAction: async function() {} }
    }, overrides);
}

test('customer intents save normalized edits and award the matching action after commit', async function() {
    for (const entry of [[update.createUpdateCustomerIntent, 'customersEdited'], [archive.createArchiveCustomerIntent, 'customersArchived']]) {
        const calls = [];
        const p = payload({
            customerApi: {
                updateCustomer: async function(id, data) { calls.push('save'); assert.equal(data.name, 'Updated'); },
                deleteCustomer: async function() { calls.push('save'); }
            },
            rewards: { awardAction: async function(action) { calls.push(action); } }
        });
        const result = await pipeline.run(entry[0]({ id: 'staff' }, p));
        assert.equal(result.ok, true);
        assert.deepEqual(calls, ['save', entry[1]]);
        assert.equal(result.intent.actor.role, 'manager');
    }
});

test('denied writes and unauthorized actors cannot earn customer rewards', async function() {
    for (const create of [update.createUpdateCustomerIntent, archive.createArchiveCustomerIntent]) {
        let awards = 0;
        const denied = async function() { throw Object.assign(new Error('Denied'), { code: 'permission-denied' }); };
        const p = payload({ customerApi: { updateCustomer: denied, deleteCustomer: denied }, rewards: { awardAction: async function() { awards += 1; } } });
        const result = await pipeline.run(create({ id: 'staff' }, p));
        assert.equal(result.ok, false);
        assert.match(result.errors.join(' '), /denied/i);
        assert.equal(awards, 0);
        p.state.getState = function() { return { isAdmin: false }; };
        assert.equal((await pipeline.run(create({ id: 'staff' }, p))).ok, false);
    }
});

test('pending rewards do not block a successful edit and invalid PIN never writes', async function() {
    const p = payload({ rewards: { awardAction: function() { return new Promise(function() {}); } } });
    assert.equal((await pipeline.run(update.createUpdateCustomerIntent({ id: 'staff' }, p))).ok, true);
    p.data.pinCode = 'bad';
    p.customerApi.updateCustomer = function() { assert.fail('Invalid PIN must not write'); };
    assert.equal((await pipeline.run(update.createUpdateCustomerIntent({ id: 'staff' }, p))).ok, false);
});

function viewHarness() {
    const modals = [];
    const element = { style: {}, appendChild: function() {}, addEventListener: function() {}, querySelectorAll: function() { return []; } };
    element.querySelector = function() { return element; };
    const source = fs.readFileSync('js/views/customerView.js', 'utf8').replace(/^import .*;\r?\n/gm, '').replace('export const renderCustomers', 'var renderCustomers');
    const context = {
        window: {}, document: { getElementById: function() { return element; }, createElement: function() { return element; } },
        layoutView: { render: function() {}, updateTitle: function() {} },
        customerController: { loadAllCustomers: async function() { return [{ id: 'customer-1', name: 'A "quoted" customer', pinCode: '123456' }]; }, getCustomerById: function() { assert.fail('Visible customer should not require another cloud read'); }, archiveCustomer: async function() { return false; } },
        LoadingSkeleton: function() { return ''; }, t: function(key) { return key; },
        DataTable: class { render() { return ''; } },
        Modal: class { constructor(options) { this.options = options; modals.push(this); } open() {} }
    };
    vm.createContext(context);
    vm.runInContext(source, context);
    return { context, modals };
}

test('visible customer opens edit despite unavailable detail read and escapes stored values', async function() {
    const h = viewHarness();
    await h.context.renderCustomers();
    await h.context.window.editCustomer('customer-1');
    assert.match(h.modals[0].options.content, /A &quot;quoted&quot; customer/);
});

test('archive keeps its dialog and row on failure and removes row only on success', async function() {
    const h = viewHarness();
    await h.context.renderCustomers();
    h.context.window.archiveCustomer('customer-1');
    assert.equal(await h.modals[0].options.onConfirm(), false);
    assert.equal(vm.runInContext('displayedCustomers.length', h.context), 1);
    h.context.customerController.archiveCustomer = async function() { return true; };
    assert.equal(await h.modals[0].options.onConfirm(), true);
    assert.equal(vm.runInContext('displayedCustomers.length', h.context), 0);
});

test('customer badge milestones unlock at the intended counts', function() {
    const source = fs.readFileSync('js/services/gamificationService.js', 'utf8');
    const start = source.indexOf('export const BADGES =');
    const end = source.indexOf('\nconst XP_BY_ACTION', start);
    const context = vm.createContext({});
    vm.runInContext(source.slice(start, end).replace('export const BADGES', 'var BADGES'), context);
    for (const [id, action, threshold] of [['customer_editor', 'customersEdited', 1], ['customer_caretaker', 'customersEdited', 25], ['customer_archivist', 'customersArchived', 1]]) {
        const badge = context.BADGES.find(function(item) { return item.id === id; });
        assert.equal(badge.condition({ actions: { [action]: threshold - 1 } }), false);
        assert.equal(badge.condition({ actions: { [action]: threshold } }), true);
    }
});

test('modal prevents duplicate submissions and restores retry after a failed save', async function() {
    let click;
    let complete;
    let calls = 0;
    const button = { addEventListener: function(event, handler) { click = handler; }, setAttribute: function() {}, removeAttribute: function() {} };
    const cancel = { addEventListener: function() {} };
    const backdrop = { style: {}, querySelector: function(selector) { return selector === '.confirm-btn' ? button : cancel; }, addEventListener: function() {}, remove: function() {} };
    const context = vm.createContext({
        t: function(key) { return key; },
        document: { getElementById: function() { return { appendChild: function() {} }; }, createElement: function() { return backdrop; }, addEventListener: function() {}, removeEventListener: function() {} }
    });
    const source = fs.readFileSync('js/components/modal.js', 'utf8').replace(/^import .*;\r?\n/gm, '').replace('export class Modal', 'class Modal');
    vm.runInContext(source + '\nthis.Modal = Modal;', context);
    const modal = new context.Modal({ lockWhileSubmitting: true, onConfirm: function() { calls += 1; return new Promise(function(resolve) { complete = resolve; }); } });
    modal.open();
    const saving = click();
    await click();
    assert.equal(calls, 1);
    assert.equal(button.disabled, true);
    modal.close();
    assert.equal(modal.modalEl, backdrop);
    complete(false);
    await saving;
    assert.equal(button.disabled, false);
    assert.equal(modal.modalEl, backdrop);
});
