import resultHelpers from '../../../../js/ICF/engine/resultHelpers.js';

export function emitRestart(intent) {
    return resultHelpers.success(resultHelpers.addResultDataToIntent(intent, intent.context.result));
}
