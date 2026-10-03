import { createDesktopAction } from './createDesktopAction.js';
export function createFileDesktopInvoicesIntent(actor, payload, api) {
    return createDesktopAction('FileDesktopInvoicesIntent', actor, payload, api);
}
