import resultHelpers from "../../../engine/resultHelpers.js";

function emitConfirmProductMatch(intent) {
    intent.context.events = [{ type: 'ProductMatchConfirmed', key: intent.payload.key, productId: intent.context.product.id }];
    return resultHelpers.success(intent);
}
export default { emitConfirmProductMatch: emitConfirmProductMatch };
