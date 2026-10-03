// Development-only entry point. Never included in the installed renderer.
import './main.js';
import { authService } from '../../js/core/authService.js';
import { connectionStateService } from '../../js/services/connectionStateService.js';
import { customerService } from '../../js/services/customerService.js';
import sessionDataStore from '../../js/services/sessionDataStore.js';
import { offlineReadinessService } from '../../js/services/offlineReadinessService.js';
import { reserveInvoicePrintWindow, showNativeInvoicePrint } from '../../js/services/nativeInvoicePrintService.js';
import { router } from '../../js/router.js';
import bulkInvoicePrintService from '../../js/services/bulkInvoicePrintService.js';

window.desktopIntegration = {
    auth: authService, connection: connectionStateService, customers: customerService,
    session: sessionDataStore, readiness: offlineReadinessService, router: router,
    reservePrint: reserveInvoicePrintWindow, showPrint: showNativeInvoicePrint, bulkPrint: bulkInvoicePrintService
};
