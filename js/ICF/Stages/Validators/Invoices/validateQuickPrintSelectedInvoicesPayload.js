import resultHelpers from "../../../engine/resultHelpers.js";
import bulkInvoicePrintService from "../../../../services/bulkInvoicePrintService.js";

function validateQuickPrintSelectedInvoicesPayload(intent) {
  var payload = intent && intent.payload ? intent.payload : {};
  var errors = [];
  if (!Array.isArray(payload.orderIds) || payload.orderIds.length === 0) {
    errors.push("Select at least one printable invoice.");
  }
  if (payload.layout !== "full" && payload.layout !== "two-up-portrait") {
    errors.push("The selected invoice print layout is not supported.");
  }
  if (Array.isArray(payload.orderIds)) {
    var index = 0;
    while (index < payload.orderIds.length) {
      if (typeof payload.orderIds[index] !== "string" || !payload.orderIds[index].trim()) {
        errors.push("Every selected order ID must be a non-empty string.");
        break;
      }
      index = index + 1;
    }
  }
  if (bulkInvoicePrintService.isGenerationActive()) {
    errors.push("Another combined invoice PDF is already being prepared.");
  }
  if (errors.length > 0) {
    return resultHelpers.validationFailure(errors);
  }
  return resultHelpers.success(intent);
}

export default {
  validateQuickPrintSelectedInvoicesPayload: validateQuickPrintSelectedInvoicesPayload
};
