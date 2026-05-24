// ICF/Stages/Authorizers/Core/passAuthorize.js

import createAuthorizerModule from "../../../StageFactories/createAuthorizer.js";

var passAuthorize = createAuthorizerModule.createAuthorizer({
  id: "passAuthorize",
  name: "Pass Authorize",
  description: "Explicit pass-through authorizer for Intents that have no permission check beyond registration yet.",
  authorize: function authorize() {
    return true;
  }
});

export default {
  passAuthorize: passAuthorize
};
