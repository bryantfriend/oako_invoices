import { layoutView } from "./layoutView.js";
import { settingsController } from "../controllers/settingsController.js";
import { createCard } from "../components/card.js";
import { LoadingSkeleton } from "../components/loadingSkeleton.js";
import { productService } from "../services/productService.js";
import { inventoryService } from "../services/inventoryService.js";
import { buildGoogleSheetUrl, getGoogleSheetId } from "../services/settingsService.js";

function escapeAttribute(value = '') {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function displayCourierPin(pin) {
    const digits = String(pin || '').replace(/\D/g, '');
    if (/^\d{5}$/.test(digits)) return digits;
    if (/^0\d{5}$/.test(digits)) return digits.slice(1);
    if (/^\d{6}$/.test(digits)) return digits.slice(1);
    return '23456';
}

export const renderSettings = async () => {
    layoutView.render();
    layoutView.updateTitle("Invoice Settings");

    const container = document.getElementById('page-container');
    container.innerHTML = LoadingSkeleton();

    const [settings, allCategories, inventorySettings] = await Promise.all([
        settingsController.loadSettings(),
        productService.getAllCategories(),
        inventoryService.getInventorySettings()
    ]);

    const enabledCatIds = inventorySettings.enabledCategories || [];
    const googleSheetId = getGoogleSheetId(settings.googleSheetId);
    const googleSheetUrl = buildGoogleSheetUrl(googleSheetId);

    container.innerHTML = `
        <div class="animate-slide-up" style="max-width: 800px; margin: 0 auto;">
            <form id="settings-form">
                ${createCard({
        title: 'Business Information',
        content: `
                        <div class="input-group" style="display: flex; gap: var(--space-6); align-items: start;">
                            <div style="flex: 1;">
                                <label>Business Logo</label>
                                <div style="display: flex; flex-direction: column; gap: 8px;">
                                    <input type="file" id="logo-upload" accept="image/*" style="display: none;">
                                    <button type="button" class="btn btn-secondary" onclick="document.getElementById('logo-upload').click()">
                                        📤 Choose New Logo
                                    </button>
                                    <input type="hidden" name="logoUrl" id="logo-url-input" value="${settings.logoUrl || ''}">
                                    <small style="color: var(--color-gray-500);">Max 5MB. Recommended: 800x400 transparent PNG.</small>
                                </div>
                            </div>
                            <div id="logo-preview-container" style="width: 200px; height: 100px; border: 2px dashed var(--color-gray-200); border-radius: 8px; display: flex; align-items: center; justify-content: center; overflow: hidden; background: #fff;">
                                ${settings.logoUrl ? `<img src="${settings.logoUrl}" style="max-width: 100%; max-height: 100%;">` : '<span style="color: var(--color-gray-400); font-size: 12px;">No Logo</span>'}
                            </div>
                        </div>

                        <div class="input-group">
                            <label>Company Display Name</label>
                            <input type="text" name="companyName" value="${settings.companyName || 'Kyrgyz Organics'}" required>
                        </div>
                        <div class="input-group">
                            <label>Business Address</label>
                            <textarea name="address" rows="2">${settings.address || ''}</textarea>
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4);">
                            <div class="input-group">
                                <label>Phone Number</label>
                                <input type="tel" name="phone" value="${settings.phone || ''}">
                            </div>
                            <div class="input-group">
                                <label>Website</label>
                                <input type="text" name="website" value="${settings.website || ''}">
                            </div>
                        </div>
                    `
    })}

                ${createCard({
        title: 'Financial & Payment Settings',
        content: `
                        <div class="input-group">
                            <label>Default Tax Rate (%)</label>
                            <input type="number" name="defaultTaxRate" value="${settings.defaultTaxRate ?? 0}" step="0.1" style="width: 120px;">
                        </div>
                        <div class="input-group">
                            <label>Bank Account / Payment Terms</label>
                            <textarea name="bankInfo" rows="4" placeholder="Bank name, Account #, SWIFT...">${settings.bankInfo || ''}</textarea>
                        </div>
                        <div class="input-group">
                            <label>Payment QR Image</label>
                            <div style="display: flex; gap: 16px; align-items: start; flex-wrap: wrap;">
                                <div style="display: flex; flex-direction: column; gap: 8px; min-width: 220px;">
                                    <input type="file" id="payment-qr-upload" accept="image/*" style="display: none;">
                                    <button type="button" class="btn btn-secondary" onclick="document.getElementById('payment-qr-upload').click()">
                                        Upload Payment QR
                                    </button>
                                    <input type="hidden" name="paymentQrImageUrl" id="payment-qr-url-input" value="${settings.paymentQrImageUrl || ''}">
                                    <small style="color: var(--color-gray-500);">Upload the QR picture customers should scan for payment. PNG works best.</small>
                                </div>
                                <div id="payment-qr-preview-container" style="width: 132px; height: 132px; border: 2px dashed var(--color-gray-200); border-radius: 12px; display: flex; align-items: center; justify-content: center; overflow: hidden; background: #fff;">
                                    ${settings.paymentQrImageUrl ? `<img src="${settings.paymentQrImageUrl}" style="width: 100%; height: 100%; object-fit: contain; padding: 8px;">` : '<span style="color: var(--color-gray-400); font-size: 12px; text-align: center; padding: 12px;">No payment QR uploaded</span>'}
                                </div>
                            </div>
                        </div>
                        <div style="display: flex; gap: 16px; margin-bottom: 12px;">
                            <label style="display: flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer;">
                                <input type="checkbox" name="showQrCode" value="true" ${settings.showQrCode !== false ? 'checked' : ''}>
                                Show Payment QR
                            </label>
                            <label style="display: flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer;">
                                <input type="checkbox" name="showNotes" value="true" ${settings.showNotes !== false ? 'checked' : ''}>
                                Show Notes
                            </label>
                            <label style="display: flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer;">
                                <input type="checkbox" name="showFooter" value="true" ${settings.showFooter !== false ? 'checked' : ''}>
                                Show Banner Footer
                            </label>
                        </div>
                        <div class="input-group" style="margin-bottom: 12px;">
                            <label>Invoice Notes (English)</label>
                            <textarea name="notesEn" rows="2" placeholder="Payment due within 30 days...">${settings.notesEn || 'Payment due within 30 days. Please transfer to account:'}</textarea>
                        </div>
                        <div class="input-group" style="margin-bottom: 12px;">
                            <label>Invoice Notes (Russian)</label>
                            <textarea name="notesRu" rows="2" placeholder="Оплата в течение 30 дней...">${settings.notesRu || 'Оплата в течение 30 дней. Перевод на счет:'}</textarea>
                        </div>
                        <div class="input-group">
                            <label>Invoice Banner Footer Text</label>
                            <input type="text" name="footerText" value="${settings.footerText || 'Thanks for supporting sustainable agriculture!'}" placeholder="Message at the bottom...">
                        </div>
                    `
    })}

                ${createCard({
        title: 'Invoice Layout',
        content: `
                        <div class="input-group">
                            <label>Items Per Invoice Page</label>
                            <input type="number" name="invoiceItemsPerPage" value="${settings.invoiceItemsPerPage ?? 7}" min="1" max="30" step="1" style="width: 120px;">
                            <small style="color: var(--color-gray-500);">Default is 7. Lower this if long product names or payment details need more room.</small>
                        </div>
                        <div class="input-group">
                            <label>Approval Link Expiration (hours)</label>
                            <input type="number" name="approvalLinkExpirationHours" value="${settings.approvalLinkExpirationHours ?? 24}" min="1" max="720" step="1" style="width: 120px;">
                            <small style="color: var(--color-gray-500);">Customer approval links expire after this many hours. Default is 24.</small>
                        </div>
                    `
    })}

                ${createCard({
        title: 'Mobile Access & Sync',
        content: `
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4);">
                            <div class="input-group">
                                <label>Courier PIN Code: 0 + five digits</label>
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <span style="font-weight: 900; font-size: 18px; color: var(--color-primary-700);">0</span>
                                    <input type="text" name="courierPin" value="${displayCourierPin(settings.courierPin)}" minlength="5" maxlength="5" pattern="\\d{5}" placeholder="23456" style="max-width: 140px;">
                                </div>
                                <small style="color: var(--color-gray-500);">Courier enters 0 plus these 5 digits. Example: 0${displayCourierPin(settings.courierPin)}.</small>
                            </div>
                            <div class="input-group">
                                <label>WhatsApp Number</label>
                                <input type="tel" name="whatsappNumber" value="${settings.whatsappNumber || ''}" placeholder="996700123456">
                            </div>
                        </div>
                        <div class="input-group">
                            <label>Google Sheet ID</label>
                            <input type="text" name="googleSheetId" value="${escapeAttribute(googleSheetId)}" placeholder="Paste Sheet ID or full Google Sheets URL" autocapitalize="off" autocomplete="off" autocorrect="off" spellcheck="false" style="font-family: ui-monospace, SFMono-Regular, Consolas, 'Liberation Mono', monospace; text-transform: none;">
                            ${googleSheetUrl ? `
                                <a href="${googleSheetUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm" style="display: inline-flex; margin-top: 8px; text-decoration: none;">
                                    Open Google Sheet
                                </a>
                            ` : `
                                <small style="color: var(--color-gray-500);">Add the Sheet ID here and save to show a quick open link.</small>
                            `}
                            <small style="color: var(--color-gray-500);">Case-sensitive. Lowercase l and uppercase I are preserved exactly; the monospace font makes them easier to tell apart.</small>
                        </div>
                        <div class="input-group">
                            <label>Google Sheets Webhook URL</label>
                            <input type="url" name="googleSheetsWebhookUrl" value="${escapeAttribute(settings.googleSheetsWebhookUrl || '')}" placeholder="Apps Script web app URL" autocapitalize="off" autocomplete="off" autocorrect="off" spellcheck="false">
                            <small style="color: var(--color-gray-500);">Required for saving completed invoices into the sheet. Completion will not be blocked if this sync fails.</small>
                        </div>
                        <label style="display: flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer;">
                            <input type="checkbox" name="syncEnabled" value="true" ${settings.syncEnabled ? 'checked' : ''}>
                            Enable completed-invoice Google Sheets sync
                        </label>
                    `
    })}

                ${createCard({
        title: 'Inventory Categories',
        content: `
                        <p style="font-size: 13px; color: var(--color-gray-500); margin-bottom: 16px;">
                            Select which product categories should be tracked in the Inventory tab.
                        </p>
                        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px;">
                            ${allCategories.map(cat => `
                                <label style="display: flex; align-items: center; gap: 8px; font-size: 14px; cursor: pointer;">
                                    <input type="checkbox" name="inventory_cat" value="${cat.id}" ${enabledCatIds.includes(cat.id) ? 'checked' : ''}>
                                    ${cat.name}
                                </label>
                            `).join('')}
                        </div>
                    `
    })}

                <div style="display: flex; justify-content: flex-end; margin-top: var(--space-6); gap: var(--space-4); align-items: center;">
                    <div id="save-status" style="font-size: 14px; color: var(--color-gray-500);"></div>
                    <button type="submit" class="btn btn-primary">Save All Settings</button>
                </div>
            </form>
        </div>
    `;

    // Handle Logo Upload
    const logoInput = document.getElementById('logo-upload');
    const logoUrlInput = document.getElementById('logo-url-input');
    const previewContainer = document.getElementById('logo-preview-container');
    const paymentQrInput = document.getElementById('payment-qr-upload');
    const paymentQrUrlInput = document.getElementById('payment-qr-url-input');
    const paymentQrPreview = document.getElementById('payment-qr-preview-container');

    logoInput?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const saveStatus = document.getElementById('save-status');

        try {
            previewContainer.innerHTML = '<div class="loader-sm"></div>';
            saveStatus.textContent = "Uploading logo...";

            const url = await settingsController.handleUploadLogo(file);
            logoUrlInput.value = url;
            previewContainer.innerHTML = `<img src="${url}" style="max-width: 100%; max-height: 100%; animation: fade-in 0.3s ease;">`;

            // Auto-save the logo URL to settings immediately
            saveStatus.textContent = "Saving updated logo...";
            const formData = new FormData(document.getElementById('settings-form'));
            const data = Object.fromEntries(formData.entries());
            data.defaultTaxRate = parseFloat(data.defaultTaxRate) || 0;
            data.invoiceItemsPerPage = parseInt(data.invoiceItemsPerPage, 10) || 7;
            data.approvalLinkExpirationHours = parseInt(data.approvalLinkExpirationHours, 10) || 24;
            data.showQrCode = formData.get('showQrCode') === 'true';
            data.showNotes = formData.get('showNotes') === 'true';
            data.showFooter = formData.get('showFooter') === 'true';
            data.syncEnabled = formData.get('syncEnabled') === 'true';

            await settingsController.updateSettings(data);
            saveStatus.textContent = "Logo saved!";
            setTimeout(() => { if (saveStatus) saveStatus.textContent = ""; }, 3000);

        } catch (error) {
            previewContainer.innerHTML = '<span style="color: var(--color-danger-500); font-size: 12px;">Failed</span>';
            saveStatus.textContent = "Upload failed";
        }
    });

    paymentQrInput?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const saveStatus = document.getElementById('save-status');

        try {
            paymentQrPreview.innerHTML = '<div class="loader-sm"></div>';
            saveStatus.textContent = "Uploading payment QR...";

            const url = await settingsController.handleUploadPaymentQr(file);
            paymentQrUrlInput.value = url;
            paymentQrPreview.innerHTML = `<img src="${url}" style="width: 100%; height: 100%; object-fit: contain; padding: 8px; animation: fade-in 0.3s ease;">`;

            const formData = new FormData(document.getElementById('settings-form'));
            const data = Object.fromEntries(formData.entries());
            data.defaultTaxRate = parseFloat(data.defaultTaxRate) || 0;
            data.invoiceItemsPerPage = parseInt(data.invoiceItemsPerPage, 10) || 7;
            data.approvalLinkExpirationHours = parseInt(data.approvalLinkExpirationHours, 10) || 24;
            data.showQrCode = formData.get('showQrCode') === 'true';
            data.showNotes = formData.get('showNotes') === 'true';
            data.showFooter = formData.get('showFooter') === 'true';
            data.syncEnabled = formData.get('syncEnabled') === 'true';

            await settingsController.updateSettings(data);
            saveStatus.textContent = "Payment QR saved!";
            setTimeout(() => { if (saveStatus) saveStatus.textContent = ""; }, 3000);
        } catch (error) {
            paymentQrPreview.innerHTML = '<span style="color: var(--color-danger-500); font-size: 12px;">Failed</span>';
            saveStatus.textContent = "Upload failed";
        }
    });

    document.getElementById('settings-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const saveStatus = document.getElementById('save-status');
        saveStatus.textContent = "Saving...";

        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());
        data.defaultTaxRate = parseFloat(data.defaultTaxRate) || 0;
        data.invoiceItemsPerPage = parseInt(data.invoiceItemsPerPage, 10) || 7;
        data.approvalLinkExpirationHours = parseInt(data.approvalLinkExpirationHours, 10) || 24;
        data.showQrCode = formData.get('showQrCode') === 'true';
        data.showNotes = formData.get('showNotes') === 'true';
        data.showFooter = formData.get('showFooter') === 'true';
        data.syncEnabled = formData.get('syncEnabled') === 'true';

        // Extract inventory categories
        const enabledCategories = formData.getAll('inventory_cat');

        const [settingsSuccess, inventorySuccess] = await Promise.all([
            settingsController.updateSettings(data),
            inventoryService.updateInventorySettings({ enabledCategories })
        ]);

        saveStatus.textContent = (settingsSuccess && inventorySuccess) ? "Saved Successfully" : "Error Saving";
        setTimeout(() => { if (saveStatus) saveStatus.textContent = ""; }, 3000);
    });
};
