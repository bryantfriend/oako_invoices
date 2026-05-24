// ICF/Stages/Normalizers/Core/passNormalize.js

import createNormalizerModule from "../../../StageFactories/createNormalizer.js";

var passNormalize = createNormalizerModule.createNormalizer({
  id: "passNormalize",
  name: "Pass Normalize",
  description: "Explicit pass-through normalizer for Intents that do not need payload cleanup yet.",
  normalize: function normalize(intent) {
    return intent;
  }
});

export default {
  passNormalize: passNormalize
};
