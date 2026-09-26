import { startOvenLoading } from './ovenLoading.js';
var activeProgress = null;
export function startInvoicePreparationProgress() {
    stopInvoicePreparationProgress();
    activeProgress = startOvenLoading('Preparing printable invoice');
    return activeProgress;
}
export function finishInvoicePreparationProgress() {
    if (activeProgress) activeProgress.finish();
    activeProgress = null;
}
export function stopInvoicePreparationProgress() {
    if (activeProgress) activeProgress.fail();
    activeProgress = null;
}
export default { startInvoicePreparationProgress, finishInvoicePreparationProgress, stopInvoicePreparationProgress };
