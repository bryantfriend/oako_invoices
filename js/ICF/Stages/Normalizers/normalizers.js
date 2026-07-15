// ICF/Stages/Normalizers/normalizers.js

import passNormalizationModule from "./Core/passNormalization.js";
import passNormalizeModule from "./Core/passNormalize.js";
import trimPayloadStringFieldModule from "./Core/trimPayloadStringField.js";
import normalizePayloadNumberFieldModule from "./Core/normalizePayloadNumberField.js";
import normalizePayloadBooleanFieldModule from "./Core/normalizePayloadBooleanField.js";
import normalizePayloadDateFieldModule from "./Core/normalizePayloadDateField.js";
import exampleTrimProductNameModule from "./Core/exampleTrimProductName.js";
import normalizeArchiveInvoicePayloadModule from "./Invoices/normalizeArchiveInvoicePayload.js";
import normalizeGenerateInvoiceApprovalLinkPayloadModule from "./Invoices/normalizeGenerateInvoiceApprovalLinkPayload.js";
import normalizeSubmitInvoiceApprovalResponsePayloadModule from "./Invoices/normalizeSubmitInvoiceApprovalResponsePayload.js";
import normalizeUpdateInvoiceItemsPayloadModule from "./Invoices/normalizeUpdateInvoiceItemsPayload.js";
import normalizeRecordInvoiceReturnPayloadModule from "./Invoices/normalizeRecordInvoiceReturnPayload.js";
import normalizeUpdateOrderStatusPayloadModule from "./Orders/normalizeUpdateOrderStatusPayload.js";
import normalizeQuickPrintSelectedInvoicesPayloadModule from "./Invoices/normalizeQuickPrintSelectedInvoicesPayload.js";

/**
 * Normalizers
 *
 * This file gathers all normalizer functions and normalizer factories
 * into one readable object.
 *
 * Intent files should import this file, then choose the normalizers they need.
 */

var normalizers = {
  passNormalization: passNormalizationModule.passNormalization,
  passNormalize: passNormalizeModule.passNormalize,
  exampleTrimProductName: exampleTrimProductNameModule.exampleTrimProductName,
  normalizeArchiveInvoicePayload:
    normalizeArchiveInvoicePayloadModule.normalizeArchiveInvoicePayload,
  normalizeGenerateInvoiceApprovalLinkPayload:
    normalizeGenerateInvoiceApprovalLinkPayloadModule.normalizeGenerateInvoiceApprovalLinkPayload,
  normalizeSubmitInvoiceApprovalResponsePayload:
    normalizeSubmitInvoiceApprovalResponsePayloadModule.normalizeSubmitInvoiceApprovalResponsePayload,
  normalizeUpdateInvoiceItemsPayload:
    normalizeUpdateInvoiceItemsPayloadModule.normalizeUpdateInvoiceItemsPayload,
  normalizeRecordInvoiceReturnPayload:
    normalizeRecordInvoiceReturnPayloadModule.normalizeRecordInvoiceReturnPayload,
  normalizeUpdateOrderStatusPayload:
    normalizeUpdateOrderStatusPayloadModule.normalizeUpdateOrderStatusPayload,

  normalizeQuickPrintSelectedInvoicesPayload:
    normalizeQuickPrintSelectedInvoicesPayloadModule.normalizeQuickPrintSelectedInvoicesPayload,

  createTrimPayloadStringFieldNormalizer:
    trimPayloadStringFieldModule.createTrimPayloadStringFieldNormalizer,

  createNormalizePayloadNumberFieldNormalizer:
    normalizePayloadNumberFieldModule.createNormalizePayloadNumberFieldNormalizer,

  createNormalizePayloadBooleanFieldNormalizer:
    normalizePayloadBooleanFieldModule.createNormalizePayloadBooleanFieldNormalizer,

  createNormalizePayloadDateFieldNormalizer:
    normalizePayloadDateFieldModule.createNormalizePayloadDateFieldNormalizer
};

export default normalizers;
