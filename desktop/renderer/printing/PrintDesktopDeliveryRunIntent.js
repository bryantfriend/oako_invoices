import { createDesktopAction } from './createDesktopAction.js';
export function createPrintDesktopDeliveryRunIntent(actor, payload, api) {
    return createDesktopAction('PrintDesktopDeliveryRunIntent', actor, payload, api);
}
