import resultHelpers from '../../../../js/ICF/engine/resultHelpers.js';

export function emitDesktopAction(intent) {
    return resultHelpers.success(resultHelpers.addResultDataToIntent(intent, intent.context.result));
}
