import { createDesktopAction } from './createDesktopAction.js';
export function createSaveDesktopWorkflowSettingsIntent(actor, payload, api) {
    return createDesktopAction('SaveDesktopWorkflowSettingsIntent', actor, payload, api);
}
