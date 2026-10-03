import { createDesktopAction } from './createDesktopAction.js';
export function createChooseDesktopPdfFolderIntent(actor, payload, api) {
    return createDesktopAction('ChooseDesktopPdfFolderIntent', actor, payload, api);
}
