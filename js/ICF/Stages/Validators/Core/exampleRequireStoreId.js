// ICF/Stages/Validators/Core/exampleRequireStoreId.js

import createValidatorModule from "../../../StageFactories/createValidator.js";
import resultHelpers from "../../../engine/resultHelpers.js";

var exampleRequireStoreId = createValidatorModule.createValidator({
  id: "exampleRequireStoreId",
  name: "Example Require Store Id",
  description: "Example validator that requires payload.storeId before a store-related Intent can continue.",
  check: function check(intent) {
    if (!intent) {
      return [
        "Intent is required."
      ];
    }

    if (!intent.payload) {
      return [
        resultHelpers.missingField("intent.payload")
      ];
    }

    if (!intent.payload.storeId) {
      return [
        resultHelpers.missingField("intent.payload.storeId")
      ];
    }

    return true;
  }
});

export default {
  exampleRequireStoreId: exampleRequireStoreId
};
