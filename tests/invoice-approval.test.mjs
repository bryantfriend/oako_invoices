import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('approval-link creation has an admin Firestore create rule', function() {
    const rules = read('firebase/firestore.rules');
    const approvalRuleStart = rules.indexOf('match /invoiceApprovalLinks/{token}');
    const notificationRuleStart = rules.indexOf('match /notifications/{notificationId}');
    const approvalRules = rules.slice(approvalRuleStart, notificationRuleStart);

    assert.notEqual(approvalRuleStart, -1);
    assert.notEqual(notificationRuleStart, -1);
    assert.match(approvalRules, /allow create: if isAdmin\(\)/);
    assert.match(approvalRules, /request\.resource\.data\.token == token/);
    assert.match(approvalRules, /request\.resource\.data\.status == "pending"/);
    assert.match(approvalRules, /request\.resource\.data\.invoiceSnapshot is map/);
});

test('Generate Approval Link keeps all required ICF stages', function() {
    const source = read('js/ICF/Intents/GenerateInvoiceApprovalLinkIntent.js');
    const stages = ['Validate', 'Normalize', 'AddContext', 'Authorize', 'Process', 'Emit'];

    stages.forEach(function(stageName) {
        assert.match(source, new RegExp(stageName + ': \\{'));
    });
});
