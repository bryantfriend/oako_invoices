import * as stages from './stages.js';

export function createDesktopAction(type, actor, payload, api) {
    return {
        type: type, actor: actor, payload: payload,
        context: { api: api }, meta: { createdAt: Date.now(), source: 'desktop-printing' },
        stages: {
            Validate: { validateDesktopAction: stages.validateDesktopAction },
            Normalize: { normalizeDesktopAction: stages.normalizeDesktopAction },
            AddContext: { addDesktopActionContext: stages.addDesktopActionContext },
            Authorize: { authorizeDesktopAction: stages.authorizeDesktopAction },
            Process: { processDesktopAction: stages.processDesktopAction },
            Emit: { emitDesktopAction: stages.emitDesktopAction }
        }
    };
}
