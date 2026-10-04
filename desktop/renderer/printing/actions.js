import pipeline from '../../../js/ICF/engine/pipeline.js';
import registry from '../../../js/ICF/engine/intentRegistry.js';
import { authService } from '../../../js/core/authService.js';
import { createSaveDesktopPrintSettingsIntent } from './SaveDesktopPrintSettingsIntent.js';
import { createChooseDesktopPdfFolderIntent } from './ChooseDesktopPdfFolderIntent.js';
import { createPrintDesktopInvoicesIntent } from './PrintDesktopInvoicesIntent.js';
import { createFileDesktopInvoicesIntent } from './FileDesktopInvoicesIntent.js';
import { createPrintDesktopDeliveryRunIntent } from './PrintDesktopDeliveryRunIntent.js';
import { createSaveDesktopWorkflowSettingsIntent } from './SaveDesktopWorkflowSettingsIntent.js';

var factories = {
    saveSettings: createSaveDesktopPrintSettingsIntent,
    chooseFolder: createChooseDesktopPdfFolderIntent,
    print: createPrintDesktopInvoicesIntent,
    file: createFileDesktopInvoicesIntent,
    deliveryRun: createPrintDesktopDeliveryRunIntent,
    saveWorkflow: createSaveDesktopWorkflowSettingsIntent
};

registry.registerIntent('SaveDesktopPrintSettingsIntent', createSaveDesktopPrintSettingsIntent);
registry.registerIntent('ChooseDesktopPdfFolderIntent', createChooseDesktopPdfFolderIntent);
registry.registerIntent('PrintDesktopInvoicesIntent', createPrintDesktopInvoicesIntent);
registry.registerIntent('FileDesktopInvoicesIntent', createFileDesktopInvoicesIntent);
registry.registerIntent('PrintDesktopDeliveryRunIntent', createPrintDesktopDeliveryRunIntent);
registry.registerIntent('SaveDesktopWorkflowSettingsIntent', createSaveDesktopWorkflowSettingsIntent);

function getVerifiedUser() {
    var state = authService.getAuthDebugState();
    return { id: state.uid, isAdmin: state.authReady && state.signedIn && state.isAdmin };
}

export async function runDesktopPrintAction(operation, payload) {
    var bridge = window.desktopApp;
    if (!bridge || !factories[operation]) throw new Error('This action requires the Windows app.');
    var user = getVerifiedUser();
    var api = Object.assign({}, bridge, { getVerifiedUser: getVerifiedUser });
    var result = await pipeline.run(factories[operation]({ id: user.id || 'signed-out', role: 'staff' }, payload || {}, api));
    if (!result.ok) throw new Error((result.errors || ['Desktop action failed.']).join(' '));
    return result.data;
}
