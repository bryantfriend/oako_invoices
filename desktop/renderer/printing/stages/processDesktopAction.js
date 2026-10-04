export async function processDesktopAction(intent) {
    var api = intent.context.api;
    if (intent.type === 'SaveDesktopPrintSettingsIntent') intent.context.result = await api.savePrintSettings(intent.payload);
    else if (intent.type === 'ChooseDesktopPdfFolderIntent') intent.context.result = await api.choosePdfFolder();
    else if (intent.type === 'PrintDesktopInvoicesIntent') intent.context.result = await api.printInvoices(intent.payload);
    else if (intent.type === 'FileDesktopInvoicesIntent') intent.context.result = await api.fileInvoices(intent.payload);
    else if (intent.type === 'PrintDesktopDeliveryRunIntent') intent.context.result = await api.printDeliveryRun(intent.payload);
    else if (intent.type === 'SaveDesktopWorkflowSettingsIntent') intent.context.result = await api.saveWorkflowSettings(intent.payload);
    else return { ok: false, errors: ['Unknown desktop action.'] };
    return { ok: true, intent: intent };
}
