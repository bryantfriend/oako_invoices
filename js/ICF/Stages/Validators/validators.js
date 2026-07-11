// ICF/Stages/Validators/validators.js

import passValidationModule from "./Core/passValidation.js";
import passValidateModule from "./Core/passValidate.js";
import requireIntentTypeModule from "./Core/requireIntentType.js";
import requireActorModule from "./Core/requireActor.js";
import requirePayloadModule from "./Core/requirePayload.js";
import requireContextModule from "./Core/requireContext.js";
import requireActorRoleModule from "./Core/requireActorRole.js";
import requireBaseIntentShapeModule from "./Core/requireBaseIntentShape.js";
import exampleRequireStoreIdModule from "./Core/exampleRequireStoreId.js";
import validateArchiveInvoicePayloadModule from "./Invoices/validateArchiveInvoicePayload.js";
import validateGenerateInvoiceApprovalLinkPayloadModule from "./Invoices/validateGenerateInvoiceApprovalLinkPayload.js";
import validateSubmitInvoiceApprovalResponsePayloadModule from "./Invoices/validateSubmitInvoiceApprovalResponsePayload.js";
import validateUpdateInvoiceItemsPayloadModule from "./Invoices/validateUpdateInvoiceItemsPayload.js";
import validateRecordInvoiceReturnPayloadModule from "./Invoices/validateRecordInvoiceReturnPayload.js";
import validateUpdateOrderStatusPayloadModule from "./Orders/validateUpdateOrderStatusPayload.js";

/**
 * Validators
 *
 * This file gathers all validator functions into one readable object.
 *
 * Intent files should import this file, then choose the validators they need.
 *
 * Example:
 *
 * Validate: {
 *   requireIntentType: validators.requireIntentType,
 *   requireActor: validators.requireActor,
 *   requirePayload: validators.requirePayload
 * }
 */

var validators = {
  passValidation: passValidationModule.passValidation,
  passValidate: passValidateModule.passValidate,

  requireIntentType: requireIntentTypeModule.requireIntentType,
  requireActor: requireActorModule.requireActor,
  requirePayload: requirePayloadModule.requirePayload,
  requireContext: requireContextModule.requireContext,
  requireBaseIntentShape: requireBaseIntentShapeModule.requireBaseIntentShape,
  exampleRequireStoreId: exampleRequireStoreIdModule.exampleRequireStoreId,
  validateArchiveInvoicePayload:
    validateArchiveInvoicePayloadModule.validateArchiveInvoicePayload,
  validateGenerateInvoiceApprovalLinkPayload:
    validateGenerateInvoiceApprovalLinkPayloadModule.validateGenerateInvoiceApprovalLinkPayload,
  validateSubmitInvoiceApprovalResponsePayload:
    validateSubmitInvoiceApprovalResponsePayloadModule.validateSubmitInvoiceApprovalResponsePayload,
  validateUpdateInvoiceItemsPayload:
    validateUpdateInvoiceItemsPayloadModule.validateUpdateInvoiceItemsPayload,
  validateRecordInvoiceReturnPayload:
    validateRecordInvoiceReturnPayloadModule.validateRecordInvoiceReturnPayload,
  validateUpdateOrderStatusPayload:
    validateUpdateOrderStatusPayloadModule.validateUpdateOrderStatusPayload,

  createRequireActorRoleValidator: requireActorRoleModule.createRequireActorRoleValidator
};

export default validators;
