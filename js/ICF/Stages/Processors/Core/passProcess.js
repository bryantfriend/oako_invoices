// ICF/Stages/Processors/Core/passProcess.js

import createProcessorModule from "../../../StageFactories/createProcessor.js";

var passProcess = createProcessorModule.createProcessor({
  id: "passProcess",
  name: "Pass Process",
  description: "Explicit pass-through processor for Intents that do not change result data or state yet.",
  process: function process(intent) {
    return intent;
  }
});

export default {
  passProcess: passProcess
};
