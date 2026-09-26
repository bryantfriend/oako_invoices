import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModule } from './helpers/load-isolated-module.mjs';

test('normal Print and Quick Print share in-flight preparation and can retry after failure', async function() {
    var calls = 0;
    var release;
    var modules = {
        firebase: { auth: { currentUser: { uid: 'staff', email: 'staff@example.test' } } },
        pipeline: { run: function() {
            calls += 1;
            return new Promise(function(resolve) { release = resolve; });
        } },
        PreparePrintableInvoiceIntent: { createPreparePrintableInvoiceIntent: function() { return {}; } }
    };
    var service = (await loadModule('js/services/invoiceService.js', modules)).invoiceService;
    var first = service.preparePrintableInvoice('saved-order', { id: 'saved-order' });
    var second = service.preparePrintableInvoice('saved-order', { id: 'saved-order' });
    assert.equal(calls, 1);
    release({ ok: true, data: { invoiceId: 'prepared' } });
    assert.equal((await first).data.invoiceId, 'prepared');
    assert.equal((await second).data.invoiceId, 'prepared');
    var failed = service.preparePrintableInvoice('another-order');
    release({ ok: false, errors: ['Permission denied'] });
    await assert.rejects(failed, /Permission denied/);
    var retry = service.preparePrintableInvoice('another-order');
    assert.equal(calls, 3);
    release({ ok: true, data: { invoiceId: 'recovered' } });
    assert.equal((await retry).data.invoiceId, 'recovered');
});
