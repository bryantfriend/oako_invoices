import resultHelpers from '../../../engine/resultHelpers.js';
async function processPrepareInvoiceBatch(intent) {
    var api = intent.context.workflowApi;
    var rows = intent.payload.rows;
    var completed = [];
    var failed = [];
    for (var index = 0; index < rows.length; index += 1) {
        var row = rows[index];
        try {
            var result = await api.prepareRow(row);
            row.orderId = result.order.id;
            row.invoiceId = result.invoice.id;
            row.status = 'ready';
            row.error = '';
            completed.push(row);
        } catch (error) {
            row.status = 'failed';
            row.error = error.message;
            failed.push(row);
        }
        await api.checkpointBatch(rows, index + 1);
    }
    intent.context.workflowResult = { completed: completed, failed: failed, rows: rows };
    return resultHelpers.success(intent);
}
export default { processPrepareInvoiceBatch: processPrepareInvoiceBatch };
