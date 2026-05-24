// ICF/Stages/ContextProviders/Core/passAddContext.js

import createContextAdderModule from "../../../StageFactories/createContextAdder.js";

var passAddContext = createContextAdderModule.createContextAdder({
  id: "passAddContext",
  name: "Pass Add Context",
  description: "Explicit pass-through AddContext step for Intents that have no trusted system data to attach yet.",
  add: function add(intent) {
    return intent;
  }
});

export default {
  passAddContext: passAddContext
};
