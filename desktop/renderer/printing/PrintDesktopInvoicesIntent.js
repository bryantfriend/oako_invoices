import { createDesktopAction } from './createDesktopAction.js';
export function createPrintDesktopInvoicesIntent(actor, payload, api) {
    return createDesktopAction('PrintDesktopInvoicesIntent', actor, payload, api);
}
