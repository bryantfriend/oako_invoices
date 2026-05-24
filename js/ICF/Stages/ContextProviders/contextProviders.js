// ICF/Stages/ContextProviders/contextProviders.js

import passContextModule from "./Core/passContext.js";
import passAddContextModule from "./Core/passAddContext.js";
import addTimestampContextModule from "./Core/addTimestampContext.js";
import addSourceContextModule from "./Core/addSourceContext.js";
import addActorRoleContextModule from "./Core/addActorRoleContext.js";
import addStaticContextValueModule from "./Core/addStaticContextValue.js";
import addArchiveInvoiceContextModule from "./Invoices/addArchiveInvoiceContext.js";

/**
 * Context Providers
 *
 * This file gathers all context provider functions and factories into one
 * readable object.
 *
 * Intent files should import this file, then choose the context providers
 * they need.
 *
 * AddContext should attach trusted system data needed by later stages.
 */

var contextProviders = {
  passContext: passContextModule.passContext,
  passAddContext: passAddContextModule.passAddContext,

  addTimestampContext: addTimestampContextModule.addTimestampContext,
  addSourceContext: addSourceContextModule.addSourceContext,
  addActorRoleContext: addActorRoleContextModule.addActorRoleContext,
  addArchiveInvoiceContext:
    addArchiveInvoiceContextModule.addArchiveInvoiceContext,

  createAddStaticContextValueProvider:
    addStaticContextValueModule.createAddStaticContextValueProvider
};

export default contextProviders;
