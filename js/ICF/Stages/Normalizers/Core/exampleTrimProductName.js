// ICF/Stages/Normalizers/Core/exampleTrimProductName.js

import createNormalizerModule from "../../../StageFactories/createNormalizer.js";
import resultHelpers from "../../../engine/resultHelpers.js";

var exampleTrimProductName = createNormalizerModule.createNormalizer({
  id: "exampleTrimProductName",
  name: "Example Trim Product Name",
  description: "Example normalizer that trims payload.productName so later stages work with clean text.",
  normalize: function normalize(intent) {
    var payloadCopy = copyPayload(intent);

    if (typeof payloadCopy.productName === "string") {
      payloadCopy.productName = payloadCopy.productName.trim();
    }

    return resultHelpers.success(
      resultHelpers.replacePayload(intent, payloadCopy)
    );
  }
});

function copyPayload(intent) {
  var payloadCopy = {};
  var sourcePayload = {};
  var payloadKeys = [];
  var keyIndex = 0;

  if (intent && intent.payload) {
    sourcePayload = intent.payload;
  }

  payloadKeys = Object.keys(sourcePayload);

  while (keyIndex < payloadKeys.length) {
    payloadCopy[payloadKeys[keyIndex]] = sourcePayload[payloadKeys[keyIndex]];
    keyIndex = keyIndex + 1;
  }

  return payloadCopy;
}

export default {
  exampleTrimProductName: exampleTrimProductName
};
