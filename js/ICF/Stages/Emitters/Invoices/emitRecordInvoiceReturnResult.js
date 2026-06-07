import resultHelpers from "../../../engine/resultHelpers.js";

function emitRecordInvoiceReturnResult(intent) {
  var data = intent && intent.context && intent.context.returnResult
    ? intent.context.returnResult
    : {};

  return resultHelpers.successWithData(intent, {
    ok: true,
    message: "Returned items recorded.",
    data: data
  });
}

export default {
  emitRecordInvoiceReturnResult: emitRecordInvoiceReturnResult
};
