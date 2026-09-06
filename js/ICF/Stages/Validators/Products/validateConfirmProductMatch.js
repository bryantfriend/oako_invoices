import resultHelpers from "../../../engine/resultHelpers.js";

function validateConfirmProductMatch(intent) {
    var payload = intent.payload || {};
    if (!payload.source || !payload.key || !payload.productId || !payload.categoryId || !payload.catalogApi || !payload.mappingApi) {
        return resultHelpers.validationFailure('Choose the category and a current product before confirming.');
    }
    return resultHelpers.success(intent);
}
export default { validateConfirmProductMatch: validateConfirmProductMatch };
