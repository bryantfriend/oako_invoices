import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const STAFF_ROLES = ['admin', 'superadmin', 'owner', 'manager', 'super_admin'];

function read(path) {
    return fs.readFileSync(path, 'utf8');
}

test('Firestore and client auth recognize every supported staff role', function() {
    const rules = read('firebase/firestore.rules');
    const authService = read('js/core/authService.js');
    const rulesRoleList = rules.match(/return userRole\(\) in \[([^\]]+)\]/);
    const clientRoleList = authService.match(/const ADMIN_ROLES = \[([^\]]+)\]/);

    assert.ok(rulesRoleList, 'Firestore staff role list should be present');
    assert.ok(clientRoleList, 'client staff role list should be present');

    const parseRoles = function(source) {
        return Array.from(source.matchAll(/['\"]([^'\"]+)['\"]/g), function(match) {
            return match[1];
        });
    };

    assert.deepEqual(parseRoles(rulesRoleList[1]), STAFF_ROLES);
    assert.deepEqual(parseRoles(clientRoleList[1]), STAFF_ROLES);

    assert.match(rules, /match \/customers\/\{customerId\}[\s\S]*allow read, create, update: if isAdmin\(\);/);
});

test('customer edit modal remains open when the update is rejected', function() {
    const customerView = read('js/views/customerView.js');

    assert.match(customerView, /const success = await customerController\.handleUpdateCustomer\(id, data\);\s*if \(!success\) return false;/);
});
