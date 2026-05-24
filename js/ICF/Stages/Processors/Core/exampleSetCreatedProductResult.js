// ICF/Stages/Processors/Core/exampleSetCreatedProductResult.js

import createProcessorModule from "../../../StageFactories/createProcessor.js";
import resultHelpers from "../../../engine/resultHelpers.js";

var exampleSetCreatedProductResult = createProcessorModule.createProcessor({
  id: "exampleSetCreatedProductResult",
  name: "Example Set Created Product Result",
  description: "Example processor that writes a simple product-created result into intent.context.resultData.",
  process: function process(intent) {
    return resultHelpers.success(
      resultHelpers.addResultDataToIntent(intent, {
        productCreated: true,
        productName: getProductName(intent)
      })
    );
  }
});

function getProductName(intent) {
  if (!intent) {
    return "";
  }

  if (!intent.payload) {
    return "";
  }

  if (!intent.payload.productName) {
    return "";
  }

  return intent.payload.productName;
}

export default {
  exampleSetCreatedProductResult: exampleSetCreatedProductResult
};
