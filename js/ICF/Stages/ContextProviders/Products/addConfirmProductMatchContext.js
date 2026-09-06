import resultHelpers from "../../../engine/resultHelpers.js";

async function addConfirmProductMatchContext(intent) {
    intent.context.catalog = await intent.payload.catalogApi.load();
    return resultHelpers.success(intent);
}
export default { addConfirmProductMatchContext: addConfirmProductMatchContext };
