import * as stages from './stages.js';

export function createRestartDesktopUpdateIntent(actor, payload, api) {
    return {
        type: 'RestartDesktopUpdateIntent', actor: actor, payload: payload,
        context: { api: api }, meta: { createdAt: Date.now(), source: 'desktop-update' },
        stages: {
            Validate: { validateRestart: stages.validateRestart },
            Normalize: { normalizeRestart: stages.normalizeRestart },
            AddContext: { addRestartContext: stages.addRestartContext },
            Authorize: { authorizeRestart: stages.authorizeRestart },
            Process: { processRestart: stages.processRestart },
            Emit: { emitRestart: stages.emitRestart }
        }
    };
}
