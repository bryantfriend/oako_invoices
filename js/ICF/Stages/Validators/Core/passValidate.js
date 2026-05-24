// ICF/Stages/Validators/Core/passValidate.js

import createValidatorModule from "../../../StageFactories/createValidator.js";

var passValidate = createValidatorModule.createValidator({
  id: "passValidate",
  name: "Pass Validate",
  description: "Explicit pass-through validator for Intents that have no custom validation work yet.",
  check: function check() {
    return true;
  }
});

export default {
  passValidate: passValidate
};
