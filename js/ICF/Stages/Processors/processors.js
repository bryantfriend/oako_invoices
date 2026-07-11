// ICF/Stages/Processors/processors.js

import doNothingModule from "./Core/doNothing.js";
import passProcessModule from "./Core/passProcess.js";
import setResultDataModule from "./Core/setResultData.js";
import addPayloadToResultDataModule from "./Core/addPayloadToResultData.js";
import addContextToResultDataModule from "./Core/addContextToResultData.js";
import exampleSetCreatedProductResultModule from "./Core/exampleSetCreatedProductResult.js";
import processArchiveInvoiceModule from "./Invoices/processArchiveInvoice.js";
import processGenerateInvoiceApprovalLinkModule from "./Invoices/processGenerateInvoiceApprovalLink.js";
import processSubmitInvoiceApprovalResponseModule from "./Invoices/processSubmitInvoiceApprovalResponse.js";
import processUpdateInvoiceItemsModule from "./Invoices/processUpdateInvoiceItems.js";
import processRecordInvoiceReturnModule from "./Invoices/processRecordInvoiceReturn.js";
import processUpdateOrderStatusModule from "./Orders/processUpdateOrderStatus.js";

/**
 * Processors
 *
 * This file gathers all processor functions and processor factories
 * into one readable object.
 *
 * Intent files should import this file, then choose the processors they need.
 *
 * Process should perform the main state change.
 */

var processors = {
  doNothing: doNothingModule.doNothing,
  passProcess: passProcessModule.passProcess,
  exampleSetCreatedProductResult:
    exampleSetCreatedProductResultModule.exampleSetCreatedProductResult,
  processArchiveInvoice: processArchiveInvoiceModule.processArchiveInvoice,
  processGenerateInvoiceApprovalLink:
    processGenerateInvoiceApprovalLinkModule.processGenerateInvoiceApprovalLink,
  processSubmitInvoiceApprovalResponse:
    processSubmitInvoiceApprovalResponseModule.processSubmitInvoiceApprovalResponse,
  processUpdateInvoiceItems:
    processUpdateInvoiceItemsModule.processUpdateInvoiceItems,
  processRecordInvoiceReturn:
    processRecordInvoiceReturnModule.processRecordInvoiceReturn,
  processUpdateOrderStatus:
    processUpdateOrderStatusModule.processUpdateOrderStatus,

  createSetResultDataProcessor:
    setResultDataModule.createSetResultDataProcessor,

  addPayloadToResultData:
    addPayloadToResultDataModule.addPayloadToResultData,

  addContextToResultData:
    addContextToResultDataModule.addContextToResultData
};

export default processors;
