import { createDesktopAction } from './createDesktopAction.js';
export function createSaveDesktopPrintSettingsIntent(actor, payload, api) {
    return createDesktopAction('SaveDesktopPrintSettingsIntent', actor, payload, api);
}
